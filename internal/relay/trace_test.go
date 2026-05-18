package relay

import (
	"strings"
	"testing"

	"github.com/bestruirui/octopus/internal/model"
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
	metrics := &RelayMetrics{}
	attempts := metrics.enrichTraceAttempts(t.Context(), []model.ChannelAttempt{{
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
