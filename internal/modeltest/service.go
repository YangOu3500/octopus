package modeltest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bestruirui/octopus/internal/grouphealth"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/price"
	"github.com/bestruirui/octopus/internal/relay/balancer"
	transformerModel "github.com/bestruirui/octopus/internal/transformer/model"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
	"github.com/bestruirui/octopus/internal/utils/tokenizer"
)

const (
	DefaultPrompt       = "只回复 OK"
	defaultMaxTokens    = int64(8)
	defaultTimeout      = 30 * time.Second
	maxTargetsPerRun    = 100
	maxRunConcurrency   = 8
	requestSource       = "model_test"
	responsePreviewSize = 512
)

var (
	ErrInvalidRequest = errors.New("invalid model test request")

	sensitiveBearerPattern = regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._~+/=-]+`)
	sensitiveAPIKeyPattern = regexp.MustCompile(`(?i)\bsk-[A-Za-z0-9._-]{8,}`)
	sensitiveHeaderPattern = regexp.MustCompile(`(?i)(authorization|cookie|set-cookie|x-api-key|x-goog-api-key|session|jwt)\s*[:=]\s*[^\r\n,;]+`)
)

type RunRequest struct {
	Mode        string      `json:"mode"`
	Targets     []RunTarget `json:"targets"`
	Prompt      string      `json:"prompt"`
	MaxTokens   int64       `json:"max_tokens"`
	Temperature float64     `json:"temperature"`
	Concurrency int         `json:"concurrency"`
	Stream      bool        `json:"stream"`
}

type RunTarget struct {
	ChannelID int    `json:"channel_id"`
	ModelName string `json:"model_name"`
	GroupID   int    `json:"group_id,omitempty"`
	GroupName string `json:"group_name,omitempty"`
}

type RunResponse struct {
	Mode        string      `json:"mode"`
	Prompt      string      `json:"prompt,omitempty"`
	Stream      bool        `json:"stream"`
	Concurrency int         `json:"concurrency"`
	Total       int         `json:"total"`
	Success     int         `json:"success"`
	Failed      int         `json:"failed"`
	Results     []RunResult `json:"results"`
}

type RunResult struct {
	Index           int     `json:"index"`
	ChannelID       int     `json:"channel_id"`
	ChannelName     string  `json:"channel_name"`
	ChannelKeyID    int     `json:"channel_key_id,omitempty"`
	GroupID         int     `json:"group_id,omitempty"`
	GroupName       string  `json:"group_name,omitempty"`
	ModelName       string  `json:"model_name"`
	Protocol        string  `json:"protocol"`
	Success         bool    `json:"success"`
	Status          string  `json:"status"`
	HTTPStatus      int     `json:"http_status"`
	FailureReason   string  `json:"failure_reason,omitempty"`
	ErrorMessage    string  `json:"error_message,omitempty"`
	DurationMS      int64   `json:"duration_ms"`
	TTFBMS          int64   `json:"ttfb_ms,omitempty"`
	InputTokens     int     `json:"input_tokens,omitempty"`
	OutputTokens    int     `json:"output_tokens,omitempty"`
	CacheTokens     int     `json:"cache_tokens,omitempty"`
	TokensPerSecond float64 `json:"tokens_per_second,omitempty"`
	InputCost       float64 `json:"input_cost,omitempty"`
	OutputCost      float64 `json:"output_cost,omitempty"`
	EstimatedCost   float64 `json:"estimated_cost,omitempty"`
	ResponseText    string  `json:"response_text,omitempty"`
	LogID           int64   `json:"log_id,omitempty"`
	TraceID         string  `json:"trace_id,omitempty"`
}

type Service struct {
	prober *grouphealth.Prober
}

func NewService(prober *grouphealth.Prober) *Service {
	if prober == nil {
		prober = grouphealth.NewProber()
	}
	if prober.CandidateTimeout <= 0 {
		prober.CandidateTimeout = defaultTimeout
	}
	return &Service{prober: prober}
}

func (s *Service) Run(ctx context.Context, req RunRequest) (RunResponse, error) {
	req = normalizeRunRequest(req)
	if err := validateRunRequest(req); err != nil {
		return RunResponse{}, err
	}

	results := make([]RunResult, len(req.Targets))
	sem := make(chan struct{}, req.Concurrency)
	var wg sync.WaitGroup
	for i, target := range req.Targets {
		i, target := i, target
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[i] = s.runTarget(ctx, req, target, i+1)
		}()
	}
	wg.Wait()

	success := 0
	for _, result := range results {
		if result.Success {
			success++
		}
	}

	return RunResponse{
		Mode:        req.Mode,
		Prompt:      req.Prompt,
		Stream:      req.Stream,
		Concurrency: req.Concurrency,
		Total:       len(results),
		Success:     success,
		Failed:      len(results) - success,
		Results:     results,
	}, nil
}

func normalizeRunRequest(req RunRequest) RunRequest {
	req.Mode = strings.ToLower(strings.TrimSpace(req.Mode))
	if req.Mode == "" {
		req.Mode = "channel"
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" {
		req.Prompt = DefaultPrompt
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = defaultMaxTokens
	}
	if req.MaxTokens > 256 {
		req.MaxTokens = 256
	}
	if req.Temperature < 0 {
		req.Temperature = 0
	}
	if req.Temperature > 2 {
		req.Temperature = 2
	}
	if req.Concurrency <= 0 {
		req.Concurrency = 2
	}
	if req.Concurrency > maxRunConcurrency {
		req.Concurrency = maxRunConcurrency
	}
	for i := range req.Targets {
		req.Targets[i].ModelName = strings.TrimSpace(req.Targets[i].ModelName)
		req.Targets[i].GroupName = strings.TrimSpace(req.Targets[i].GroupName)
	}
	return req
}

func validateRunRequest(req RunRequest) error {
	switch req.Mode {
	case "channel", "model":
	default:
		return fmt.Errorf("%w: unsupported mode", ErrInvalidRequest)
	}
	if len(req.Targets) == 0 {
		return fmt.Errorf("%w: targets are required", ErrInvalidRequest)
	}
	if len(req.Targets) > maxTargetsPerRun {
		return fmt.Errorf("%w: too many targets, max %d", ErrInvalidRequest, maxTargetsPerRun)
	}
	seen := make(map[string]struct{}, len(req.Targets))
	for _, target := range req.Targets {
		if target.ChannelID <= 0 {
			return fmt.Errorf("%w: channel_id is required", ErrInvalidRequest)
		}
		if target.ModelName == "" {
			return fmt.Errorf("%w: model_name is required", ErrInvalidRequest)
		}
		key := strconv.Itoa(target.ChannelID) + "\x00" + strings.ToLower(target.ModelName)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
	}
	return nil
}

func (s *Service) runTarget(ctx context.Context, req RunRequest, target RunTarget, index int) RunResult {
	result := RunResult{
		Index:     index,
		ChannelID: target.ChannelID,
		GroupID:   target.GroupID,
		GroupName: target.GroupName,
		ModelName: target.ModelName,
		Status:    string(model.AttemptFailed),
	}

	channel, err := op.ChannelGet(target.ChannelID, ctx)
	if err != nil {
		result.FailureReason = "channel_not_found"
		result.ErrorMessage = sanitizeText(err.Error())
		result.DurationMS = 0
		s.recordResult(ctx, &result, nil, model.ChannelKey{}, req)
		return result
	}

	result.ChannelName = channel.Name
	result.Protocol = outboundProtocol(channel.Type)
	if !channel.Enabled {
		result.FailureReason = "channel_disabled"
		result.ErrorMessage = "channel is disabled"
		s.recordResult(ctx, &result, channel, model.ChannelKey{}, req)
		return result
	}
	if !outbound.IsChatChannelType(channel.Type) {
		result.FailureReason = "unsupported_channel_type"
		result.ErrorMessage = "channel type does not support chat model test"
		s.recordResult(ctx, &result, channel, model.ChannelKey{}, req)
		return result
	}

	usedKey := channel.GetChannelKey()
	result.ChannelKeyID = usedKey.ID
	if usedKey.ID == 0 || strings.TrimSpace(usedKey.ChannelKey) == "" {
		result.FailureReason = "no_available_key"
		result.ErrorMessage = "no available key"
		s.recordResult(ctx, &result, channel, usedKey, req)
		return result
	}

	probeResult := s.prober.RunCandidateWithOptions(ctx, *channel, usedKey, target.ModelName, grouphealth.ProbeOptions{
		Prompt:      req.Prompt,
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		Stream:      req.Stream,
	})
	result.HTTPStatus = probeResult.HTTPStatus
	result.DurationMS = probeResult.DurationMS
	result.TTFBMS = probeResult.TTFBMS

	usage := extractUsage(channel.Type, probeResult.ResponseBody)
	if req.Stream {
		usage = usageSummary{
			InputTokens:  probeResult.Usage.InputTokens,
			OutputTokens: probeResult.Usage.OutputTokens,
			CacheTokens:  probeResult.Usage.CacheTokens,
		}
	}
	result.InputTokens = usage.InputTokens
	result.OutputTokens = usage.OutputTokens
	result.CacheTokens = usage.CacheTokens
	result.InputCost, result.OutputCost, result.EstimatedCost = estimateCost(ctx, channel.ID, target.ModelName, usage)
	if result.OutputTokens > 0 && result.DurationMS > 0 {
		result.TokensPerSecond = float64(result.OutputTokens) / (float64(result.DurationMS) / 1000)
	}

	if req.Stream {
		result.ResponseText = sanitizeText(probeResult.ResponseText)
	} else {
		result.ResponseText = sanitizeText(extractResponseText(channel.Type, probeResult.ResponseBody))
	}
	if result.ResponseText == "" && len(probeResult.ResponseBody) > 0 {
		result.ResponseText = sanitizeText(snippet(string(probeResult.ResponseBody), responsePreviewSize))
	}

	if probeResult.Success {
		result.Success = true
		result.Status = string(model.AttemptSuccess)
	} else {
		result.FailureReason = slugReason(probeResult.ErrorMessage)
		result.ErrorMessage = sanitizeText(probeResult.ErrorMessage)
		if result.FailureReason == "" {
			result.FailureReason = "attempt_failed"
		}
	}

	s.recordResult(ctx, &result, channel, usedKey, req)
	return result
}

func (s *Service) recordResult(ctx context.Context, result *RunResult, channel *model.Channel, usedKey model.ChannelKey, req RunRequest) {
	if result == nil {
		return
	}
	status := model.AttemptFailed
	if result.Success {
		status = model.AttemptSuccess
	}
	attempt := model.ChannelAttempt{
		ChannelID:        result.ChannelID,
		ChannelKeyID:     usedKey.ID,
		KeyID:            usedKey.ID,
		ChannelName:      result.ChannelName,
		ModelName:        result.ModelName,
		UpstreamModel:    result.ModelName,
		RequestProtocol:  requestProtocolForChannel(channel),
		UpstreamProtocol: result.Protocol,
		ResponseProtocol: requestProtocolForChannel(channel),
		AttemptNum:       1,
		AttemptIndex:     1,
		Status:           status,
		Duration:         int(result.DurationMS),
		DurationMS:       int(result.DurationMS),
		TTFBMS:           int(result.TTFBMS),
		TotalMS:          int(result.DurationMS),
		HTTPStatus:       result.HTTPStatus,
		FailureReason:    result.FailureReason,
		Retryable:        result.FailureReason != "" && (result.HTTPStatus == 0 || result.HTTPStatus == 429 || result.HTTPStatus >= 500 || result.HTTPStatus < 300),
		InputTokens:      result.InputTokens,
		OutputTokens:     result.OutputTokens,
		CacheTokens:      result.CacheTokens,
		InputCost:        result.InputCost,
		OutputCost:       result.OutputCost,
		EstimatedCost:    result.EstimatedCost,
		CostIncurred:     costIncurred(*result),
		CostSource:       costSource(*result),
		ErrorSummary:     result.ErrorMessage,
		CreatedAt:        time.Now().UnixMilli(),
		Msg:              result.ErrorMessage,
	}
	if channel != nil {
		attempt.BaseURL = sanitizeBaseURL(channel.GetBaseUrl())
		if binding, err := op.SiteChannelBindingGetByChannelID(channel.ID, ctx); err == nil && binding != nil {
			attempt.SiteID = binding.SiteID
			attempt.SiteAccountID = binding.SiteAccountID
			attempt.AccountID = binding.SiteAccountID
		}
	}

	balancer.RecordHealthAttempt(balancer.HealthAttempt{
		ChannelID:     result.ChannelID,
		ChannelKeyID:  usedKey.ID,
		ModelName:     result.ModelName,
		BaseURL:       attempt.BaseURL,
		Status:        status,
		HTTPStatus:    result.HTTPStatus,
		FailureReason: result.FailureReason,
		TTFBMS:        int(result.TTFBMS),
		TotalMS:       int(result.DurationMS),
	})

	relayLog := model.RelayLog{
		Time:               time.Now().Unix(),
		GroupID:            result.GroupID,
		RequestModelName:   result.ModelName,
		RequestStream:      req.Stream,
		RequestSource:      requestSource,
		ChannelName:        result.ChannelName,
		ChannelId:          result.ChannelID,
		ActualModelName:    result.ModelName,
		FinalStatus:        result.Status,
		FinalChannelID:     result.ChannelID,
		FinalSiteID:        attempt.SiteID,
		FinalUpstreamModel: result.ModelName,
		AttemptsCount:      1,
		TotalLatencyMS:     int(result.DurationMS),
		UseTime:            int(result.DurationMS),
		Ftut:               int(result.TTFBMS),
		InputTokens:        result.InputTokens,
		OutputTokens:       result.OutputTokens,
		CacheTokens:        result.CacheTokens,
		Cost:               result.EstimatedCost,
		EstimatedCost:      result.EstimatedCost,
		FinalSuccessCost:   successCost(*result),
		TotalAttemptCost:   result.EstimatedCost,
		Attempts:           []model.ChannelAttempt{attempt},
		TotalAttempts:      1,
		RequestContent:     modelTestRequestLogContent(req, *result),
		ResponseContent:    modelTestResponseLogContent(*result),
		Error:              result.ErrorMessage,
	}
	saved, err := op.RelayLogAddWithResult(ctx, relayLog)
	if err == nil {
		result.LogID = saved.ID
		result.TraceID = saved.TraceID
	}
}

type usageSummary struct {
	InputTokens  int
	OutputTokens int
	CacheTokens  int
}

func extractUsage(channelType outbound.OutboundType, body []byte) usageSummary {
	var root map[string]any
	if len(body) == 0 || json.Unmarshal(body, &root) != nil {
		return usageSummary{}
	}
	if meta, ok := root["usageMetadata"].(map[string]any); ok {
		return usageSummary{
			InputTokens:  intFromMap(meta, "promptTokenCount"),
			OutputTokens: intFromMap(meta, "candidatesTokenCount"),
			CacheTokens:  intFromMap(meta, "cachedContentTokenCount"),
		}
	}
	usage, _ := root["usage"].(map[string]any)
	if usage == nil {
		return usageSummary{}
	}
	if channelType == outbound.OutboundTypeOpenAIResponse {
		cache := 0
		if details, ok := usage["input_tokens_details"].(map[string]any); ok {
			cache = intFromMap(details, "cached_tokens")
		}
		return usageSummary{
			InputTokens:  firstPositiveInt(intFromMap(usage, "input_tokens"), intFromMap(usage, "prompt_tokens")),
			OutputTokens: firstPositiveInt(intFromMap(usage, "output_tokens"), intFromMap(usage, "completion_tokens")),
			CacheTokens:  cache,
		}
	}
	cache := 0
	if details, ok := usage["prompt_tokens_details"].(map[string]any); ok {
		cache = intFromMap(details, "cached_tokens")
	}
	cache += intFromMap(usage, "cache_read_input_tokens")
	cache += intFromMap(usage, "cache_creation_input_tokens")
	return usageSummary{
		InputTokens:  firstPositiveInt(intFromMap(usage, "prompt_tokens"), intFromMap(usage, "input_tokens")),
		OutputTokens: firstPositiveInt(intFromMap(usage, "completion_tokens"), intFromMap(usage, "output_tokens")),
		CacheTokens:  cache,
	}
}

func extractResponseText(channelType outbound.OutboundType, body []byte) string {
	var root map[string]any
	if len(body) == 0 || json.Unmarshal(body, &root) != nil {
		return ""
	}
	switch channelType {
	case outbound.OutboundTypeOpenAIResponse:
		if text, ok := root["output_text"].(string); ok && strings.TrimSpace(text) != "" {
			return snippet(text, responsePreviewSize)
		}
		return snippet(joinResponsesOutputText(root["output"]), responsePreviewSize)
	case outbound.OutboundTypeAnthropic:
		return snippet(joinContentText(root["content"]), responsePreviewSize)
	case outbound.OutboundTypeGemini:
		return snippet(joinGeminiCandidateText(root["candidates"]), responsePreviewSize)
	default:
		return snippet(joinOpenAIChoiceText(root["choices"]), responsePreviewSize)
	}
}

func joinOpenAIChoiceText(value any) string {
	choices, ok := value.([]any)
	if !ok {
		return ""
	}
	parts := make([]string, 0, len(choices))
	for _, choice := range choices {
		item, _ := choice.(map[string]any)
		message, _ := item["message"].(map[string]any)
		if text, ok := message["content"].(string); ok {
			parts = append(parts, text)
		}
		if refusal, ok := message["refusal"].(string); ok && strings.TrimSpace(refusal) != "" {
			parts = append(parts, refusal)
		}
		if calls, ok := message["tool_calls"].([]any); ok && len(calls) > 0 {
			parts = append(parts, fmt.Sprintf("%d tool calls", len(calls)))
		}
	}
	return strings.Join(parts, "\n")
}

func joinResponsesOutputText(value any) string {
	output, ok := value.([]any)
	if !ok {
		return ""
	}
	parts := make([]string, 0, len(output))
	for _, item := range output {
		obj, _ := item.(map[string]any)
		parts = append(parts, joinContentText(obj["content"]))
	}
	return strings.Join(parts, "\n")
}

func joinContentText(value any) string {
	content, ok := value.([]any)
	if !ok {
		return ""
	}
	parts := make([]string, 0, len(content))
	for _, item := range content {
		obj, _ := item.(map[string]any)
		if text, ok := obj["text"].(string); ok {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n")
}

func joinGeminiCandidateText(value any) string {
	candidates, ok := value.([]any)
	if !ok {
		return ""
	}
	parts := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		obj, _ := candidate.(map[string]any)
		content, _ := obj["content"].(map[string]any)
		partList, _ := content["parts"].([]any)
		for _, part := range partList {
			partObj, _ := part.(map[string]any)
			if text, ok := partObj["text"].(string); ok {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "\n")
}

func estimateCost(ctx context.Context, channelID int, modelName string, usage usageSummary) (float64, float64, float64) {
	priceInfo := resolveModelPrice(ctx, channelID, modelName)
	if priceInfo == nil {
		return 0, 0, 0
	}
	nonCachedInput := usage.InputTokens - usage.CacheTokens
	if nonCachedInput < 0 {
		nonCachedInput = usage.InputTokens
	}
	inputCost := (float64(nonCachedInput)*priceInfo.Input + float64(usage.CacheTokens)*priceInfo.CacheRead) * 1e-6
	outputCost := float64(usage.OutputTokens) * priceInfo.Output * 1e-6
	return inputCost, outputCost, inputCost + outputCost
}

func resolveModelPrice(ctx context.Context, channelID int, actualModel string) *model.LLMPrice {
	if channelID > 0 {
		if binding, err := op.SiteChannelBindingGetByChannelID(channelID, ctx); err == nil && binding != nil {
			baseGroupKey, _ := model.ParseSiteChannelBindingKey(binding.GroupKey)
			if sitePrice, ok := op.SitePriceGet(binding.SiteAccountID, baseGroupKey, actualModel); ok {
				resolved := sitePrice
				return &resolved
			}
		}
	}
	return price.GetLLMPrice(actualModel)
}

func modelTestRequestLogContent(req RunRequest, result RunResult) string {
	payload := map[string]any{
		"source":        requestSource,
		"mode":          req.Mode,
		"model":         result.ModelName,
		"channel_id":    result.ChannelID,
		"stream":        req.Stream,
		"prompt_length": len(req.Prompt),
		"max_tokens":    req.MaxTokens,
		"temperature":   req.Temperature,
	}
	data, _ := json.Marshal(payload)
	return string(data)
}

func modelTestResponseLogContent(result RunResult) string {
	payload := map[string]any{
		"success":        result.Success,
		"http_status":    result.HTTPStatus,
		"ttfb_ms":        result.TTFBMS,
		"duration_ms":    result.DurationMS,
		"failure_reason": result.FailureReason,
		"response_text":  result.ResponseText,
	}
	data, _ := json.Marshal(payload)
	return string(data)
}

func costIncurred(result RunResult) string {
	if result.EstimatedCost > 0 || result.InputTokens > 0 || result.OutputTokens > 0 {
		return "yes"
	}
	if result.Success {
		return ""
	}
	if result.HTTPStatus == 0 || result.HTTPStatus == 401 || result.HTTPStatus == 403 || result.HTTPStatus == 429 {
		return "no"
	}
	return "unknown"
}

func costSource(result RunResult) string {
	if result.EstimatedCost > 0 || result.InputTokens > 0 || result.OutputTokens > 0 {
		return "usage"
	}
	return ""
}

func successCost(result RunResult) float64 {
	if result.Success {
		return result.EstimatedCost
	}
	return 0
}

func outboundProtocol(t outbound.OutboundType) string {
	switch t {
	case outbound.OutboundTypeOpenAIChat:
		return "openai_chat"
	case outbound.OutboundTypeOpenAIResponse:
		return "openai_response"
	case outbound.OutboundTypeAnthropic:
		return "anthropic"
	case outbound.OutboundTypeGemini:
		return "gemini"
	case outbound.OutboundTypeVolcengine:
		return "volcengine"
	case outbound.OutboundTypeOpenAIEmbedding:
		return "openai_embedding"
	default:
		return fmt.Sprintf("unknown_%d", t)
	}
}

func requestProtocolForChannel(channel *model.Channel) string {
	if channel == nil {
		return ""
	}
	switch channel.Type {
	case outbound.OutboundTypeOpenAIResponse:
		return string(transformerModel.APIFormatOpenAIResponse)
	case outbound.OutboundTypeAnthropic:
		return string(transformerModel.APIFormatAnthropicMessage)
	case outbound.OutboundTypeGemini:
		return string(transformerModel.APIFormatGeminiContents)
	case outbound.OutboundTypeOpenAIEmbedding:
		return string(transformerModel.APIFormatOpenAIEmbedding)
	default:
		return string(transformerModel.APIFormatOpenAIChatCompletion)
	}
}

func sanitizeBaseURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	parsed.User = nil
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

func sanitizeText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = sensitiveHeaderPattern.ReplaceAllString(value, "$1: [REDACTED]")
	value = sensitiveBearerPattern.ReplaceAllString(value, "Bearer [REDACTED]")
	value = sensitiveAPIKeyPattern.ReplaceAllString(value, "sk-[REDACTED]")
	return snippet(value, responsePreviewSize)
}

func slugReason(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return "attempt_failed"
	}
	const validationPrefix = "response validation failed:"
	if strings.HasPrefix(value, validationPrefix) {
		value = strings.TrimSpace(value[len(validationPrefix):])
	}
	if idx := strings.IndexAny(value, ":\r\n"); idx >= 0 {
		value = value[:idx]
	}
	var b strings.Builder
	lastUnderscore := false
	for _, r := range value {
		isASCIIAlphaNum := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if isASCIIAlphaNum {
			b.WriteRune(r)
			lastUnderscore = false
			continue
		}
		if !lastUnderscore {
			b.WriteByte('_')
			lastUnderscore = true
		}
	}
	reason := strings.Trim(b.String(), "_")
	if reason == "" {
		return "attempt_failed"
	}
	return reason
}

func snippet(value string, maxLen int) string {
	value = strings.TrimSpace(value)
	if maxLen <= 0 || len(value) <= maxLen {
		return value
	}
	return value[:maxLen]
}

func intFromMap(m map[string]any, key string) int {
	if m == nil {
		return 0
	}
	switch v := m[key].(type) {
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

func firstPositiveInt(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func SortResults(results []RunResult) {
	sort.SliceStable(results, func(i, j int) bool {
		return results[i].Index < results[j].Index
	})
}

func EstimatePromptTokens(prompt, modelName string) int {
	return tokenizer.CountTokens(prompt, modelName)
}
