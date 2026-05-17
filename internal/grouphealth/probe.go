package grouphealth

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/bestruirui/octopus/internal/gateway/validator"
	"github.com/bestruirui/octopus/internal/helper"
	"github.com/bestruirui/octopus/internal/model"
	transformerModel "github.com/bestruirui/octopus/internal/transformer/model"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

type ProbeResult struct {
	Success      bool
	HTTPStatus   int
	DurationMS   int64
	TTFBMS       int64
	ErrorMessage string
	ResponseBody []byte
	ResponseText string
	Usage        ProbeUsage
}

type ProbeUsage struct {
	InputTokens  int
	OutputTokens int
	CacheTokens  int
}

var upstreamStatusPattern = regexp.MustCompile(`(?i)\b(?:returned|status)\s+([45][0-9]{2})\b`)

type ProbeOptions struct {
	Prompt      string
	MaxTokens   int64
	Temperature float64
	Stream      bool
}

type Prober struct {
	CandidateTimeout time.Duration
	Prompt           string
	MaxTokens        int64
	Temperature      float64
}

func NewProber() *Prober {
	return &Prober{
		CandidateTimeout: 12 * time.Second,
		Prompt:           "ping",
		MaxTokens:        1,
	}
}

func (p *Prober) RunCandidate(ctx context.Context, channel model.Channel, usedKey model.ChannelKey, modelName string) ProbeResult {
	return p.RunCandidateWithOptions(ctx, channel, usedKey, modelName, p.probeOptions())
}

func (p *Prober) RunCandidateWithOptions(ctx context.Context, channel model.Channel, usedKey model.ChannelKey, modelName string, options ProbeOptions) ProbeResult {
	startedAt := time.Now()
	result := ProbeResult{}

	timeout := p.CandidateTimeout
	if timeout <= 0 {
		timeout = 12 * time.Second
	}

	probeCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	options = normalizeProbeOptions(options)
	request, err := buildProbeRequestWithOptions(probeCtx, &channel, &usedKey, modelName, options)
	if err != nil {
		result.ErrorMessage = err.Error()
		result.DurationMS = time.Since(startedAt).Milliseconds()
		return result
	}

	applyCustomHeaders(request, channel.CustomHeader)
	if err := applyParamOverride(request, channel.ParamOverride); err != nil {
		result.ErrorMessage = err.Error()
		result.DurationMS = time.Since(startedAt).Milliseconds()
		return result
	}

	httpClient, err := helper.ChannelHttpClient(&channel)
	if err != nil {
		result.ErrorMessage = err.Error()
		result.DurationMS = time.Since(startedAt).Milliseconds()
		return result
	}

	response, err := httpClient.Do(request)
	if err != nil {
		result.ErrorMessage = err.Error()
		result.DurationMS = time.Since(startedAt).Milliseconds()
		return result
	}
	defer response.Body.Close()

	result.HTTPStatus = response.StatusCode
	result.DurationMS = time.Since(startedAt).Milliseconds()

	if options.Stream || isEventStreamHeader(response.Header) {
		return readStreamProbeResponse(response, result, startedAt, channel.Type)
	}

	body, _ := io.ReadAll(io.LimitReader(response.Body, 32*1024))
	result.ResponseBody = body
	if looksLikeSSEBody(response.Header, body) {
		return readStreamProbeBufferedResponse(response.Header, body, result, startedAt, channel.Type)
	}

	if provider, ok := validatorProviderForOutbound(channel.Type); ok {
		validation := validator.ValidateNonStream(provider, validator.Response{
			StatusCode: response.StatusCode,
			Header:     response.Header,
			Body:       body,
		})
		if validation.Status == validator.ValidationOK {
			result.Success = true
			return result
		}
		if validation.Reason != "" {
			result.ErrorMessage = validation.Reason
		} else {
			result.ErrorMessage = validation.Detail
		}
		return result
	}

	if response.StatusCode >= 200 && response.StatusCode < 300 {
		result.Success = true
		return result
	}
	if len(body) > 0 {
		result.ErrorMessage = fmt.Sprintf("upstream error: %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	} else {
		result.ErrorMessage = fmt.Sprintf("upstream error: %d", response.StatusCode)
	}
	return result
}

func (p *Prober) probeOptions() ProbeOptions {
	if p == nil {
		return normalizeProbeOptions(ProbeOptions{})
	}
	return normalizeProbeOptions(ProbeOptions{
		Prompt:      p.Prompt,
		MaxTokens:   p.MaxTokens,
		Temperature: p.Temperature,
	})
}

func buildProbeRequest(ctx context.Context, channel *model.Channel, usedKey *model.ChannelKey, modelName string) (*http.Request, error) {
	return buildProbeRequestWithOptions(ctx, channel, usedKey, modelName, ProbeOptions{})
}

func buildProbeRequestWithOptions(ctx context.Context, channel *model.Channel, usedKey *model.ChannelKey, modelName string, options ProbeOptions) (*http.Request, error) {
	if channel == nil {
		return nil, fmt.Errorf("channel is nil")
	}
	if usedKey == nil {
		return nil, fmt.Errorf("channel key is nil")
	}
	if strings.TrimSpace(usedKey.ChannelKey) == "" {
		return nil, fmt.Errorf("channel key is empty")
	}
	if strings.TrimSpace(modelName) == "" {
		return nil, fmt.Errorf("model name is empty")
	}

	request := buildProbeInternalRequest(channel.Type, modelName, options)
	adapter := outbound.Get(channel.Type)
	if adapter == nil {
		return nil, fmt.Errorf("unsupported outbound type: %d", channel.Type)
	}
	return adapter.TransformRequest(ctx, request, channel.GetBaseUrl(), usedKey.ChannelKey)
}

func buildProbeInternalRequest(channelType outbound.OutboundType, modelName string, options ProbeOptions) *transformerModel.InternalLLMRequest {
	options = normalizeProbeOptions(options)
	stream := options.Stream
	prompt := options.Prompt
	maxTokens := options.MaxTokens
	temperature := options.Temperature

	switch channelType {
	case outbound.OutboundTypeOpenAIEmbedding:
		return &transformerModel.InternalLLMRequest{
			Model:        modelName,
			RawAPIFormat: transformerModel.APIFormatOpenAIEmbedding,
			EmbeddingInput: &transformerModel.EmbeddingInput{
				Single: &prompt,
			},
		}
	case outbound.OutboundTypeOpenAIResponse:
		return &transformerModel.InternalLLMRequest{
			Model:               modelName,
			RawAPIFormat:        transformerModel.APIFormatOpenAIResponse,
			Messages:            []transformerModel.Message{{Role: "user", Content: transformerModel.MessageContent{Content: &prompt}}},
			Stream:              &stream,
			MaxCompletionTokens: &maxTokens,
			Temperature:         &temperature,
		}
	case outbound.OutboundTypeAnthropic:
		return &transformerModel.InternalLLMRequest{
			Model:        modelName,
			RawAPIFormat: transformerModel.APIFormatAnthropicMessage,
			Messages:     []transformerModel.Message{{Role: "user", Content: transformerModel.MessageContent{Content: &prompt}}},
			Stream:       &stream,
			MaxTokens:    &maxTokens,
			Temperature:  &temperature,
		}
	case outbound.OutboundTypeGemini:
		return &transformerModel.InternalLLMRequest{
			Model:        modelName,
			RawAPIFormat: transformerModel.APIFormatGeminiContents,
			Messages:     []transformerModel.Message{{Role: "user", Content: transformerModel.MessageContent{Content: &prompt}}},
			Stream:       &stream,
			MaxTokens:    &maxTokens,
			Temperature:  &temperature,
		}
	case outbound.OutboundTypeVolcengine:
		return &transformerModel.InternalLLMRequest{
			Model:        modelName,
			RawAPIFormat: transformerModel.APIFormatOpenAIChatCompletion,
			Messages:     []transformerModel.Message{{Role: "user", Content: transformerModel.MessageContent{Content: &prompt}}},
			Stream:       &stream,
			MaxTokens:    &maxTokens,
			Temperature:  &temperature,
		}
	default:
		return &transformerModel.InternalLLMRequest{
			Model:        modelName,
			RawAPIFormat: transformerModel.APIFormatOpenAIChatCompletion,
			Messages:     []transformerModel.Message{{Role: "user", Content: transformerModel.MessageContent{Content: &prompt}}},
			Stream:       &stream,
			MaxTokens:    &maxTokens,
			Temperature:  &temperature,
		}
	}
}

func normalizeProbeOptions(options ProbeOptions) ProbeOptions {
	if strings.TrimSpace(options.Prompt) == "" {
		options.Prompt = "ping"
	}
	if options.MaxTokens <= 0 {
		options.MaxTokens = 1
	}
	if options.Temperature < 0 {
		options.Temperature = 0
	}
	if options.Temperature > 2 {
		options.Temperature = 2
	}
	return options
}

func isEventStreamHeader(header http.Header) bool {
	if header == nil {
		return false
	}
	return strings.Contains(strings.ToLower(header.Get("Content-Type")), "text/event-stream")
}

func looksLikeSSEBody(header http.Header, body []byte) bool {
	if isEventStreamHeader(header) {
		return true
	}
	return strings.HasPrefix(strings.TrimSpace(string(body)), "data:")
}

func readStreamProbeResponse(response *http.Response, result ProbeResult, startedAt time.Time, channelType outbound.OutboundType) ProbeResult {
	return readStreamProbeReader(response.Body, response.Header, result, startedAt, channelType)
}

func readStreamProbeBufferedResponse(header http.Header, body []byte, result ProbeResult, startedAt time.Time, channelType outbound.OutboundType) ProbeResult {
	return readStreamProbeReader(bytes.NewReader(body), header, result, startedAt, channelType)
}

func readStreamProbeReader(reader io.Reader, header http.Header, result ProbeResult, startedAt time.Time, channelType outbound.OutboundType) ProbeResult {
	collector := &streamProbeCollector{}
	scanner := bufio.NewScanner(io.LimitReader(reader, 256*1024))
	scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)

	for scanner.Scan() {
		line := scanner.Text()
		collector.appendRawLine(line)
		if textAdded, errMsg := collector.consumeLine(line); textAdded && result.TTFBMS == 0 {
			result.TTFBMS = time.Since(startedAt).Milliseconds()
		} else if errMsg != "" && result.TTFBMS == 0 {
			result.TTFBMS = time.Since(startedAt).Milliseconds()
		}
	}

	result.DurationMS = time.Since(startedAt).Milliseconds()
	result.ResponseBody = []byte(collector.rawString())
	result.ResponseText = collector.textString()
	result.Usage = collector.usage

	if err := scanner.Err(); err != nil {
		result.ErrorMessage = "stream read failed: " + err.Error()
		return result
	}
	if collector.dataLines == 0 && len(result.ResponseBody) > 0 {
		if provider, ok := validatorProviderForOutbound(channelType); ok {
			validation := validator.ValidateNonStream(provider, validator.Response{
				StatusCode: result.HTTPStatus,
				Header:     header,
				Body:       result.ResponseBody,
			})
			if validation.Status == validator.ValidationOK {
				result.Success = true
				return result
			}
			if validation.Reason != "" {
				result.ErrorMessage = validation.Reason
			} else {
				result.ErrorMessage = validation.Detail
			}
			return result
		}
	}
	if result.HTTPStatus < 200 || result.HTTPStatus >= 300 {
		if msg := strings.TrimSpace(collector.errorMessage); msg != "" {
			result.ErrorMessage = msg
			return result
		}
		if snippet := strings.TrimSpace(collector.textString()); snippet != "" {
			result.ErrorMessage = fmt.Sprintf("upstream error: %d: %s", result.HTTPStatus, snippet)
			return result
		}
		result.ErrorMessage = fmt.Sprintf("upstream error: %d", result.HTTPStatus)
		return result
	}
	if msg := strings.TrimSpace(collector.errorMessage); msg != "" {
		result.ErrorMessage = msg
		result.HTTPStatus = inferUpstreamStatusFromMessage(result.HTTPStatus, msg)
		return result
	}
	if !collector.hasText {
		result.ErrorMessage = "stream_empty_response"
		return result
	}
	result.Success = true
	return result
}

func inferUpstreamStatusFromMessage(current int, msg string) int {
	if current != 0 && (current < 200 || current >= 300) {
		return current
	}
	match := upstreamStatusPattern.FindStringSubmatch(msg)
	if len(match) < 2 {
		return current
	}
	var status int
	if _, err := fmt.Sscanf(match[1], "%d", &status); err != nil {
		return current
	}
	if status >= 400 && status <= 599 {
		return status
	}
	return current
}

type streamProbeCollector struct {
	raw          strings.Builder
	text         strings.Builder
	usage        ProbeUsage
	errorMessage string
	dataLines    int
	hasText      bool
}

func (c *streamProbeCollector) appendRawLine(line string) {
	c.raw.WriteString(line)
	c.raw.WriteByte('\n')
}

func (c *streamProbeCollector) rawString() string {
	return c.raw.String()
}

func (c *streamProbeCollector) textString() string {
	return c.text.String()
}

func (c *streamProbeCollector) consumeLine(line string) (bool, string) {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "data:") {
		return false, ""
	}
	data := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
	if data == "" {
		return false, ""
	}
	c.dataLines++
	if data == "[DONE]" {
		return false, ""
	}

	var obj map[string]any
	if err := json.Unmarshal([]byte(data), &obj); err != nil {
		c.errorMessage = "invalid_sse_json"
		return false, c.errorMessage
	}
	if msg := extractStreamProbeError(obj); msg != "" {
		c.errorMessage = msg
		return false, msg
	}

	mergeProbeUsage(&c.usage, extractProbeUsage(obj["usage"]))
	if response, ok := obj["response"].(map[string]any); ok {
		mergeProbeUsage(&c.usage, extractProbeUsage(response["usage"]))
	}
	if message, ok := obj["message"].(map[string]any); ok {
		mergeProbeUsage(&c.usage, extractProbeUsage(message["usage"]))
	}
	mergeProbeUsage(&c.usage, extractProbeUsage(obj["usageMetadata"]))

	text := extractStreamProbeText(obj)
	if strings.TrimSpace(text) == "" {
		return false, ""
	}
	c.text.WriteString(text)
	c.hasText = true
	return true, ""
}

func extractStreamProbeError(obj map[string]any) string {
	if errObj, ok := obj["error"].(map[string]any); ok {
		if msg := stringFromMap(errObj, "message"); msg != "" {
			return msg
		}
		if typ := stringFromMap(errObj, "type"); typ != "" {
			return typ
		}
		return "upstream_error"
	}
	if typ := stringFromMap(obj, "type"); typ == "error" {
		return "upstream_error"
	}
	return ""
}

func extractStreamProbeText(obj map[string]any) string {
	var parts []string
	if delta := stringFromMap(obj, "delta"); delta != "" {
		parts = append(parts, delta)
	}
	if text := stringFromMap(obj, "text"); text != "" {
		parts = append(parts, text)
	}
	if choices, ok := obj["choices"].([]any); ok {
		for _, choice := range choices {
			choiceObj, _ := choice.(map[string]any)
			if deltaObj, ok := choiceObj["delta"].(map[string]any); ok {
				if content := stringFromMap(deltaObj, "content"); content != "" {
					parts = append(parts, content)
				}
			}
			if messageObj, ok := choiceObj["message"].(map[string]any); ok {
				if content := stringFromMap(messageObj, "content"); content != "" {
					parts = append(parts, content)
				}
			}
		}
	}
	if deltaObj, ok := obj["delta"].(map[string]any); ok {
		if text := stringFromMap(deltaObj, "text"); text != "" {
			parts = append(parts, text)
		}
	}
	if candidates, ok := obj["candidates"].([]any); ok {
		for _, candidate := range candidates {
			candidateObj, _ := candidate.(map[string]any)
			if content, ok := candidateObj["content"].(map[string]any); ok {
				appendGeminiParts(&parts, content["parts"])
			}
		}
	}
	if output, ok := obj["output"].([]any); ok {
		for _, item := range output {
			itemObj, _ := item.(map[string]any)
			appendContentParts(&parts, itemObj["content"])
		}
	}
	appendContentParts(&parts, obj["content"])
	return strings.Join(parts, "")
}

func appendContentParts(parts *[]string, value any) {
	content, ok := value.([]any)
	if !ok {
		return
	}
	for _, item := range content {
		itemObj, _ := item.(map[string]any)
		if text := stringFromMap(itemObj, "text"); text != "" {
			*parts = append(*parts, text)
		}
	}
}

func appendGeminiParts(parts *[]string, value any) {
	partList, ok := value.([]any)
	if !ok {
		return
	}
	for _, part := range partList {
		partObj, _ := part.(map[string]any)
		if text := stringFromMap(partObj, "text"); text != "" {
			*parts = append(*parts, text)
		}
	}
}

func extractProbeUsage(value any) ProbeUsage {
	obj, ok := value.(map[string]any)
	if !ok || obj == nil {
		return ProbeUsage{}
	}
	cacheTokens := intFromAny(obj["cached_tokens"]) +
		intFromAny(obj["cache_read_input_tokens"]) +
		intFromAny(obj["cache_creation_input_tokens"]) +
		intFromAny(obj["cachedContentTokenCount"])
	if details, ok := obj["prompt_tokens_details"].(map[string]any); ok {
		cacheTokens += intFromAny(details["cached_tokens"])
	}
	if details, ok := obj["input_tokens_details"].(map[string]any); ok {
		cacheTokens += intFromAny(details["cached_tokens"])
	}
	return ProbeUsage{
		InputTokens: firstPositive(
			intFromAny(obj["prompt_tokens"]),
			intFromAny(obj["input_tokens"]),
			intFromAny(obj["inputTokens"]),
			intFromAny(obj["promptTokenCount"]),
		),
		OutputTokens: firstPositive(
			intFromAny(obj["completion_tokens"]),
			intFromAny(obj["output_tokens"]),
			intFromAny(obj["outputTokens"]),
			intFromAny(obj["candidatesTokenCount"]),
		),
		CacheTokens: cacheTokens,
	}
}

func mergeProbeUsage(dst *ProbeUsage, src ProbeUsage) {
	if src.InputTokens > 0 {
		dst.InputTokens = src.InputTokens
	}
	if src.OutputTokens > 0 {
		dst.OutputTokens = src.OutputTokens
	}
	if src.CacheTokens > 0 {
		dst.CacheTokens = src.CacheTokens
	}
}

func stringFromMap(obj map[string]any, key string) string {
	if obj == nil {
		return ""
	}
	value, ok := obj[key].(string)
	if !ok {
		return ""
	}
	return value
}

func intFromAny(value any) int {
	switch v := value.(type) {
	case float64:
		return int(v)
	case int:
		return v
	case int64:
		return int(v)
	case json.Number:
		i, _ := v.Int64()
		return int(i)
	default:
		return 0
	}
}

func firstPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func validatorProviderForOutbound(channelType outbound.OutboundType) (validator.Provider, bool) {
	switch channelType {
	case outbound.OutboundTypeOpenAIResponse:
		return validator.ProviderOpenAIResponses, true
	case outbound.OutboundTypeAnthropic:
		return validator.ProviderAnthropic, true
	case outbound.OutboundTypeGemini:
		return validator.ProviderGemini, true
	case outbound.OutboundTypeOpenAIEmbedding:
		return "", false
	default:
		return validator.ProviderOpenAIChat, true
	}
}

func applyCustomHeaders(request *http.Request, headers []model.CustomHeader) {
	if request == nil {
		return
	}
	for _, header := range headers {
		key := strings.TrimSpace(header.HeaderKey)
		if key == "" {
			continue
		}
		request.Header.Set(key, header.HeaderValue)
	}
}

func applyParamOverride(request *http.Request, paramOverride *string) error {
	if request == nil || request.Body == nil || paramOverride == nil || strings.TrimSpace(*paramOverride) == "" {
		return nil
	}

	body, err := io.ReadAll(request.Body)
	if err != nil {
		return fmt.Errorf("failed to read request body: %w", err)
	}

	var bodyMap map[string]any
	if err := json.Unmarshal(body, &bodyMap); err != nil {
		request.Body = io.NopCloser(bytes.NewReader(body))
		request.ContentLength = int64(len(body))
		return nil
	}

	var override map[string]any
	if err := json.Unmarshal([]byte(*paramOverride), &override); err != nil {
		request.Body = io.NopCloser(bytes.NewReader(body))
		request.ContentLength = int64(len(body))
		return nil
	}

	for key, value := range override {
		bodyMap[key] = value
	}

	modifiedBody, err := json.Marshal(bodyMap)
	if err != nil {
		return fmt.Errorf("failed to marshal request body with param override: %w", err)
	}

	request.Body = io.NopCloser(bytes.NewReader(modifiedBody))
	request.ContentLength = int64(len(modifiedBody))
	request.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(modifiedBody)), nil
	}
	return nil
}
