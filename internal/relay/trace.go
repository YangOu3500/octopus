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
		success.InputTokens = int(m.Stats.InputToken)
		success.OutputTokens = int(m.Stats.OutputToken)
		success.CacheTokens = traceCacheTokens(m.CacheReadTokens, m.CacheWriteTokens)
		success.EstimatedCost = m.Stats.InputCost + m.Stats.OutputCost
		if !m.FirstTokenTime.IsZero() && success.CreatedAt > 0 {
			if ttfb := int(m.FirstTokenTime.UnixMilli() - success.CreatedAt); ttfb >= 0 {
				success.TTFBMS = ttfb
			}
		}
	}

	return enriched
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

func errorsIsContextCanceled(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}
