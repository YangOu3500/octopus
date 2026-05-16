package grouphealth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	ErrorMessage string
}

type ProbeOptions struct {
	Prompt      string
	MaxTokens   int64
	Temperature float64
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

	body, _ := io.ReadAll(io.LimitReader(response.Body, 32*1024))

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
	stream := false
	options = normalizeProbeOptions(options)
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
