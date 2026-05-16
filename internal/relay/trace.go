package relay

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	transformerModel "github.com/bestruirui/octopus/internal/transformer/model"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
	"github.com/bestruirui/octopus/internal/utils/tokenizer"
)

var (
	traceBearerPattern = regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._~+/=-]+`)
	traceAPIKeyPattern = regexp.MustCompile(`(?i)\bsk-[A-Za-z0-9._-]{8,}`)
)

func (m *RelayMetrics) enrichTraceAttempts(ctx context.Context, attempts []model.ChannelAttempt) []model.ChannelAttempt {
	if len(attempts) == 0 {
		return attempts
	}

	enriched := make([]model.ChannelAttempt, len(attempts))
	copy(enriched, attempts)

	channelIDs := make([]int, 0, len(enriched))
	seen := make(map[int]struct{}, len(enriched))
	for _, attempt := range enriched {
		if attempt.ChannelID <= 0 {
			continue
		}
		if _, ok := seen[attempt.ChannelID]; ok {
			continue
		}
		seen[attempt.ChannelID] = struct{}{}
		channelIDs = append(channelIDs, attempt.ChannelID)
	}

	bindings := make(map[int]model.SiteChannelBinding)
	if len(channelIDs) > 0 {
		if result, err := op.SiteChannelBindingMapByChannelIDs(channelIDs, ctx); err == nil {
			bindings = result
		}
	}

	channels := make(map[int]*model.Channel, len(channelIDs))
	for _, channelID := range channelIDs {
		channel, err := op.ChannelGet(channelID, ctx)
		if err == nil && channel != nil {
			channels[channelID] = channel
		}
	}

	requestProtocol := traceRequestProtocol(m.InternalRequest)
	responseProtocol := requestProtocol

	for i := range enriched {
		attempt := &enriched[i]
		if attempt.AttemptIndex == 0 {
			attempt.AttemptIndex = attempt.AttemptNum
		}
		if attempt.KeyID == 0 {
			attempt.KeyID = attempt.ChannelKeyID
		}
		if attempt.DurationMS == 0 && attempt.Duration > 0 {
			attempt.DurationMS = attempt.Duration
		}
		if attempt.TotalMS == 0 {
			attempt.TotalMS = attempt.DurationMS
		}
		if attempt.RequestProtocol == "" {
			attempt.RequestProtocol = requestProtocol
		}
		if attempt.ResponseProtocol == "" {
			attempt.ResponseProtocol = responseProtocol
		}
		if binding, ok := bindings[attempt.ChannelID]; ok {
			attempt.SiteID = binding.SiteID
			attempt.SiteAccountID = binding.SiteAccountID
			attempt.AccountID = binding.SiteAccountID
		}
		if channel, ok := channels[attempt.ChannelID]; ok {
			attempt.BaseURL = sanitizeTraceBaseURL(channel.GetBaseUrl())
			attempt.UpstreamProtocol = traceOutboundProtocol(channel.Type)
		}
		if attempt.Status == model.AttemptFailed && !attempt.Retryable {
			attempt.Retryable = traceRetryableFailure(*attempt)
		}
		if attempt.ErrorSummary == "" {
			attempt.ErrorSummary = sanitizeTraceText(attempt.Msg, attempt.FailureReason)
		}
	}

	if idx := finalSuccessfulAttemptIndex(enriched); idx >= 0 {
		success := &enriched[idx]
		if m.ActualModel != "" {
			success.UpstreamModel = m.ActualModel
		}
		success.InputTokens = int(m.Stats.InputToken)
		success.OutputTokens = int(m.Stats.OutputToken)
		success.CacheTokens = traceCacheTokens(m.CacheReadTokens, m.CacheWriteTokens)
		success.InputCost = m.Stats.InputCost
		success.OutputCost = m.Stats.OutputCost
		success.EstimatedCost = m.Stats.InputCost + m.Stats.OutputCost
		success.CostIncurred = "yes"
		success.CostSource = "usage"
		success.ServiceTier = traceServiceTier(m)
		if !m.FirstTokenTime.IsZero() && success.CreatedAt > 0 {
			if ttfb := int(m.FirstTokenTime.UnixMilli() - success.CreatedAt); ttfb >= 0 {
				success.TTFBMS = ttfb
			}
		}
	}

	for i := range enriched {
		attempt := &enriched[i]
		if attempt.Status == model.AttemptFailed {
			m.enrichFailedAttemptCost(attempt)
		}
		if attempt.CostIncurred == "" {
			attempt.CostIncurred = traceCostIncurred(*attempt)
		}
	}

	return enriched
}

func (m *RelayMetrics) enrichFailedAttemptCost(attempt *model.ChannelAttempt) {
	if attempt == nil || attempt.Status != model.AttemptFailed {
		return
	}
	if attempt.EstimatedCost > 0 || attempt.InputTokens > 0 || attempt.OutputTokens > 0 {
		if attempt.CostIncurred == "" {
			attempt.CostIncurred = "yes"
		}
		if attempt.CostSource == "" {
			attempt.CostSource = "usage"
		}
		return
	}
	if !traceShouldEstimateFailedAttemptCost(*attempt) {
		return
	}
	inputTokens := m.estimateAttemptInputTokens(*attempt)
	if inputTokens <= 0 {
		attempt.CostIncurred = "unknown"
		attempt.CostSource = "unknown"
		return
	}
	price := resolveModelPrice(attempt.ChannelID, traceAttemptModelName(*attempt, m.RequestModel))
	if price == nil {
		attempt.InputTokens = inputTokens
		attempt.CostIncurred = "unknown"
		attempt.CostSource = "estimated_tokens"
		return
	}
	attempt.InputTokens = inputTokens
	attempt.InputCost = float64(inputTokens) * price.Input * 1e-6
	attempt.EstimatedCost = attempt.InputCost
	attempt.CostIncurred = "unknown"
	attempt.CostSource = "estimated_input"
}

func (m *RelayMetrics) estimateAttemptInputTokens(attempt model.ChannelAttempt) int {
	modelName := traceAttemptModelName(attempt, m.RequestModel)
	if len(m.RawRequest) > 0 {
		return tokenizer.CountTokens(string(m.RawRequest), modelName)
	}
	if m.InternalRequest == nil {
		return 0
	}
	return tokenizer.CountTokens(fmt.Sprintf("%+v", *m.InternalRequest), modelName)
}

func traceRequestProtocol(req *transformerModel.InternalLLMRequest) string {
	if req == nil || req.RawAPIFormat == "" {
		return ""
	}
	return string(req.RawAPIFormat)
}

func traceOutboundProtocol(t outbound.OutboundType) string {
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

func sanitizeTraceBaseURL(raw string) string {
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

func traceRetryableFailure(attempt model.ChannelAttempt) bool {
	if attempt.Status != model.AttemptFailed {
		return false
	}
	if isRetryableStatus(attempt.HTTPStatus) {
		return true
	}
	return attempt.HTTPStatus >= 200 && attempt.HTTPStatus < 300 && attempt.FailureReason != ""
}

func sanitizeTraceText(value string, fallback string) string {
	value = strings.TrimSpace(value)
	fallback = strings.TrimSpace(fallback)
	if value == "" {
		return fallback
	}

	lower := strings.ToLower(value)
	for _, marker := range []string{
		"authorization",
		"x-api-key",
		"api_key",
		"api key",
		"set-cookie",
		"cookie",
		"session",
		"jwt",
		"access_token",
		"refresh_token",
	} {
		if strings.Contains(lower, marker) {
			if fallback != "" {
				return fallback
			}
			return "redacted"
		}
	}

	value = traceBearerPattern.ReplaceAllString(value, "Bearer [REDACTED]")
	value = traceAPIKeyPattern.ReplaceAllString(value, "sk-[REDACTED]")
	if len(value) > 512 {
		value = value[:512]
	}
	return value
}

func finalSuccessfulAttemptIndex(attempts []model.ChannelAttempt) int {
	for i := len(attempts) - 1; i >= 0; i-- {
		if attempts[i].Status == model.AttemptSuccess {
			return i
		}
	}
	return -1
}

func traceFinalSiteID(attempts []model.ChannelAttempt, channelID int) int {
	for i := len(attempts) - 1; i >= 0; i-- {
		attempt := attempts[i]
		if attempt.Status == model.AttemptSuccess && attempt.ChannelID == channelID {
			return attempt.SiteID
		}
	}
	for i := len(attempts) - 1; i >= 0; i-- {
		if attempts[i].ChannelID == channelID {
			return attempts[i].SiteID
		}
	}
	return 0
}

func traceCacheTokens(readTokens, writeTokens *int) int {
	total := 0
	if readTokens != nil {
		total += *readTokens
	}
	if writeTokens != nil {
		total += *writeTokens
	}
	return total
}

func traceFinalStatus(success bool, err error) string {
	if success {
		return "success"
	}
	if err != nil && errorsIsContextCanceled(err) {
		return "canceled"
	}
	return "failed"
}

func traceServiceTier(m *RelayMetrics) string {
	if m == nil {
		return ""
	}
	if tier := strings.TrimSpace(m.ServiceTier); tier != "" {
		return tier
	}
	if m.InternalResponse != nil {
		if tier := strings.TrimSpace(m.InternalResponse.ServiceTier); tier != "" {
			return tier
		}
	}
	if m.InternalRequest != nil && m.InternalRequest.ServiceTier != nil {
		return strings.TrimSpace(*m.InternalRequest.ServiceTier)
	}
	return ""
}

func traceAttemptCostSummary(attempts []model.ChannelAttempt) (float64, float64) {
	total := 0.0
	failed := 0.0
	for _, attempt := range attempts {
		cost := attempt.EstimatedCost
		if cost == 0 {
			cost = attempt.InputCost + attempt.OutputCost
		}
		if cost <= 0 {
			continue
		}
		total += cost
		if attempt.Status == model.AttemptFailed {
			failed += cost
		}
	}
	return total, failed
}

func traceCostIncurred(attempt model.ChannelAttempt) string {
	if attempt.EstimatedCost > 0 || attempt.InputTokens > 0 || attempt.OutputTokens > 0 {
		return "yes"
	}
	if attempt.Status != model.AttemptFailed {
		return ""
	}
	switch {
	case attempt.HTTPStatus >= 200 && attempt.HTTPStatus < 300:
		return "unknown"
	case attempt.HTTPStatus == 0:
		return "no"
	case attempt.HTTPStatus == 401 || attempt.HTTPStatus == 403 || attempt.HTTPStatus == 429:
		return "no"
	case attempt.HTTPStatus >= 500:
		return "unknown"
	default:
		return "unknown"
	}
}

func traceShouldEstimateFailedAttemptCost(attempt model.ChannelAttempt) bool {
	if attempt.Status != model.AttemptFailed {
		return false
	}
	return attempt.HTTPStatus >= 200 && attempt.HTTPStatus < 300 && attempt.FailureReason != ""
}

func traceAttemptModelName(attempt model.ChannelAttempt, fallback string) string {
	if modelName := strings.TrimSpace(attempt.UpstreamModel); modelName != "" {
		return modelName
	}
	if modelName := strings.TrimSpace(attempt.ModelName); modelName != "" {
		return modelName
	}
	return strings.TrimSpace(fallback)
}

func errorsIsContextCanceled(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}
