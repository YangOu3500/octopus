package relay

import (
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	transformerModel "github.com/bestruirui/octopus/internal/transformer/model"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

func TestSanitizeTraceTextRedactsSensitiveValues(t *testing.T) {
	got := sanitizeTraceText("upstream failed: Authorization: Bearer abc.def; x-api-key=sk-real-secret", "upstream_error")
	lower := strings.ToLower(got)
	if strings.Contains(lower, "authorization") || strings.Contains(lower, "x-api-key") {
		t.Fatalf("expected sensitive markers to be redacted, got %q", got)
	}
	if strings.Contains(got, "abc.def") || strings.Contains(got, "sk-real-secret") {
		t.Fatalf("expected sensitive values to be redacted, got %q", got)
	}
	if got != "upstream_error" {
		t.Fatalf("expected fallback reason for sensitive trace text, got %q", got)
	}
}

func TestSanitizeTraceBaseURLDropsCredentialsAndQuery(t *testing.T) {
	got := sanitizeTraceBaseURL("https://user:pass@example.test/v1?api_key=secret&safe=1#frag")
	if got != "https://example.test/v1" {
		t.Fatalf("expected sanitized base url, got %q", got)
	}
}

func TestEnrichTraceAttemptsPreservesQueueAndCapacityMetadata(t *testing.T) {
	ctx := setupRelayTestDB(t)
	metrics := &RelayMetrics{}
	attempts := metrics.enrichTraceAttempts(ctx, []model.ChannelAttempt{{
		AttemptNum:                 1,
		AttemptIndex:               1,
		ChannelID:                  23,
		ChannelName:                "queue-test",
		ModelName:                  "gpt-4o",
		Status:                     model.AttemptFailed,
		FailureReason:              "channel_concurrency_queue_timeout",
		QuotaStatus:                "rate_limited",
		QuotaReason:                "http_429",
		CapacityStatus:             "blocked",
		CapacityReason:             "http_429",
		CapacityScope:              "channel_key",
		CapacitySource:             "key_status_code",
		LastObservedAt:             123,
		ExpiresAt:                  456,
		ChannelConcurrencyMode:     "database",
		ChannelConcurrencyLimit:    4,
		ChannelConcurrencyWaitMS:   1000,
		ChannelConcurrencyAcquired: false,
		ChannelConcurrencyTimedOut: true,
		CreatedAt:                  100,
	}})
	if len(attempts) != 1 {
		t.Fatalf("expected one attempt, got %+v", attempts)
	}
	attempt := attempts[0]
	if attempt.ChannelConcurrencyMode != "database" ||
		attempt.ChannelConcurrencyLimit != 4 ||
		attempt.ChannelConcurrencyWaitMS != 1000 ||
		attempt.ChannelConcurrencyAcquired ||
		!attempt.ChannelConcurrencyTimedOut {
		t.Fatalf("unexpected queue metadata after enrich: %+v", attempt)
	}
	if attempt.QuotaStatus != "rate_limited" ||
		attempt.QuotaReason != "http_429" ||
		attempt.CapacityStatus != "blocked" ||
		attempt.CapacityReason != "http_429" ||
		attempt.CapacityScope != "channel_key" ||
		attempt.CapacitySource != "key_status_code" ||
		attempt.LastObservedAt != 123 ||
		attempt.ExpiresAt != 456 {
		t.Fatalf("unexpected capacity metadata after enrich: %+v", attempt)
	}
}

func TestEnrichTraceAttemptsCompletesAttemptChainMetadata(t *testing.T) {
	ctx := setupRelayTestDB(t)
	channel := &model.Channel{
		Name:     "trace-chain-gemini-channel",
		Type:     outbound.OutboundTypeGemini,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://user:pass@example.test/v1?api_key=secret#frag"}},
		Model:    "gemini-pro",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-test", Remark: "test"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}

	cacheRead := 2
	cacheWrite := 3
	metrics := &RelayMetrics{
		RequestModel: "client-model",
		InternalRequest: &transformerModel.InternalLLMRequest{
			Model:        "client-model",
			RawAPIFormat: transformerModel.APIFormatAnthropicMessage,
		},
		ActualModel:      "gemini-pro-final",
		FirstTokenTime:   time.UnixMilli(1500),
		ServiceTier:      "priority",
		CacheReadTokens:  &cacheRead,
		CacheWriteTokens: &cacheWrite,
		Stats: model.StatsMetrics{
			InputToken:  11,
			OutputToken: 7,
			InputCost:   0.01,
			OutputCost:  0.02,
		},
	}

	attempts := metrics.enrichTraceAttempts(ctx, []model.ChannelAttempt{
		{
			ChannelID:     channel.ID,
			ChannelKeyID:  101,
			ChannelName:   "bad-soft",
			ModelName:     "gemini-pro",
			AttemptNum:    1,
			Status:        model.AttemptFailed,
			HTTPStatus:    http.StatusOK,
			FailureReason: "empty_choices",
			Duration:      80,
			CreatedAt:     1000,
			Msg:           "upstream failed: Authorization: Bearer secret-token",
		},
		{
			ChannelID:    channel.ID,
			ChannelKeyID: 102,
			ChannelName:  "good",
			ModelName:    "gemini-pro",
			AttemptNum:   2,
			Status:       model.AttemptSuccess,
			HTTPStatus:   http.StatusOK,
			CreatedAt:    1200,
		},
	})

	if len(attempts) != 2 {
		t.Fatalf("expected 2 attempts, got %+v", attempts)
	}

	failed := attempts[0]
	if failed.AttemptIndex != 1 || failed.KeyID != 101 || failed.DurationMS != 80 || failed.TotalMS != 80 {
		t.Fatalf("failed attempt chain metadata incomplete: %+v", failed)
	}
	if failed.RequestProtocol != string(transformerModel.APIFormatAnthropicMessage) ||
		failed.ResponseProtocol != string(transformerModel.APIFormatAnthropicMessage) ||
		failed.UpstreamProtocol != "gemini" {
		t.Fatalf("unexpected protocol metadata on failed attempt: %+v", failed)
	}
	if failed.BaseURL != "https://example.test/v1" {
		t.Fatalf("base url was not sanitized: %+v", failed)
	}
	if !failed.Retryable {
		t.Fatalf("expected soft failed HTTP 200 validation attempt to be retryable: %+v", failed)
	}
	if failed.ErrorSummary != "empty_choices" {
		t.Fatalf("expected sensitive failed msg to fall back to reason, got %q", failed.ErrorSummary)
	}

	success := attempts[1]
	if success.AttemptIndex != 2 || success.KeyID != 102 {
		t.Fatalf("success attempt index/key incomplete: %+v", success)
	}
	if success.UpstreamModel != "gemini-pro-final" ||
		success.InputTokens != 11 ||
		success.OutputTokens != 7 ||
		success.CacheTokens != 5 ||
		success.InputCost != 0.01 ||
		success.OutputCost != 0.02 ||
		success.EstimatedCost != 0.03 ||
		success.CostIncurred != "yes" ||
		success.CostSource != "usage" ||
		success.ServiceTier != "priority" ||
		success.TTFBMS != 300 {
		t.Fatalf("success attempt enrichment incomplete: %+v", success)
	}
}

func TestEnrichTraceAttemptsConcurrentDoesNotMutateInput(t *testing.T) {
	ctx := setupRelayTestDB(t)
	metrics := &RelayMetrics{
		RequestModel: "client-model",
		ActualModel:  "actual-model",
		Stats: model.StatsMetrics{
			InputToken:  3,
			OutputToken: 2,
			InputCost:   0.003,
			OutputCost:  0.004,
		},
	}
	input := []model.ChannelAttempt{
		{
			ChannelID:     42,
			ChannelKeyID:  420,
			ModelName:     "candidate-model",
			AttemptNum:    1,
			Status:        model.AttemptFailed,
			HTTPStatus:    http.StatusOK,
			FailureReason: "empty_choices",
			Duration:      75,
			Msg:           "soft validation failed",
		},
		{
			ChannelID:    43,
			ChannelKeyID: 430,
			ModelName:    "candidate-model",
			AttemptNum:   2,
			Status:       model.AttemptSuccess,
			HTTPStatus:   http.StatusOK,
		},
	}

	const workers = 16
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			enriched := metrics.enrichTraceAttempts(ctx, input)
			if len(enriched) != len(input) {
				t.Errorf("enriched length = %d, want %d", len(enriched), len(input))
				return
			}
			if enriched[0].AttemptIndex != 1 || enriched[0].DurationMS != 75 || !enriched[0].Retryable {
				t.Errorf("failed attempt not enriched as expected: %+v", enriched[0])
			}
			if enriched[1].UpstreamModel != "actual-model" || enriched[1].CostSource != "usage" {
				t.Errorf("success attempt not enriched as expected: %+v", enriched[1])
			}
			_, _ = traceAttemptCostSummary(enriched)
		}()
	}
	wg.Wait()

	if input[0].AttemptIndex != 0 || input[0].DurationMS != 0 || input[0].Retryable || input[0].ErrorSummary != "" {
		t.Fatalf("enrichTraceAttempts mutated failed input attempt: %+v", input[0])
	}
	if input[1].UpstreamModel != "" || input[1].CostSource != "" || input[1].InputTokens != 0 {
		t.Fatalf("enrichTraceAttempts mutated success input attempt: %+v", input[1])
	}
}
