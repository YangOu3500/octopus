package balancer

import (
	"testing"
	"time"

	"github.com/bestruirui/octopus/internal/model"
)

func enableHealthForTest(t *testing.T) {
	t.Helper()
	healthConfigOverride = &healthConfig{
		Enabled:                    true,
		Window:                     time.Hour,
		MinConfidentSample:         1,
		SuccessRatePenaltyWeight:   80,
		EmptyResponsePenaltyWeight: 20,
		LatencyPenaltyWeight:       0,
	}
	t.Cleanup(Reset)
}

func TestHealthFailoverPrefersHealthierCandidateWithinPriority(t *testing.T) {
	Reset()
	enableHealthForTest(t)

	RecordHealthAttempt(HealthAttempt{
		ChannelID:     1,
		ChannelKeyID:  11,
		ModelName:     "gpt-test",
		Status:        model.AttemptFailed,
		HTTPStatus:    200,
		FailureReason: "response validation failed: empty_choices",
	})
	RecordHealthAttempt(HealthAttempt{
		ChannelID:    2,
		ChannelKeyID: 22,
		ModelName:    "gpt-test",
		Status:       model.AttemptSuccess,
		HTTPStatus:   200,
		TotalMS:      50,
	})

	group := model.Group{
		Mode: model.GroupModeFailover,
		Items: []model.GroupItem{
			{ID: 1, ChannelID: 1, ModelName: "gpt-test", Priority: 1, Weight: 1},
			{ID: 2, ChannelID: 2, ModelName: "gpt-test", Priority: 1, Weight: 1},
		},
	}
	iter := NewIterator(group, 0, "gpt-test")
	if !iter.Next() {
		t.Fatal("expected first candidate")
	}
	if got := iter.Item().ChannelID; got != 2 {
		t.Fatalf("first candidate channel = %d, want 2", got)
	}
}

func TestHealthCooldownUsesRetryAfterAndClearsOnSuccess(t *testing.T) {
	Reset()
	enableHealthForTest(t)

	RecordHealthAttempt(HealthAttempt{
		ChannelID:     1,
		ChannelKeyID:  11,
		ModelName:     "gpt-test",
		Status:        model.AttemptFailed,
		HTTPStatus:    429,
		FailureReason: "rate_limit",
		RetryAfter:    3 * time.Second,
	})

	cooling, remaining, reason := IsHealthCoolingDown(1, 11, "gpt-test", "")
	if !cooling {
		t.Fatal("expected key to be cooling down")
	}
	if remaining <= 0 || remaining > 3*time.Second {
		t.Fatalf("remaining cooldown = %v, want within retry-after", remaining)
	}
	if reason != "rate_limit" {
		t.Fatalf("cooldown reason = %q, want rate_limit", reason)
	}

	RecordHealthAttempt(HealthAttempt{
		ChannelID:    1,
		ChannelKeyID: 11,
		ModelName:    "gpt-test",
		Status:       model.AttemptSuccess,
		HTTPStatus:   200,
	})
	cooling, _, _ = IsHealthCoolingDown(1, 11, "gpt-test", "")
	if cooling {
		t.Fatal("expected success to clear key cooldown")
	}
}

func TestIteratorRecordsHealthCooldownSkip(t *testing.T) {
	Reset()
	enableHealthForTest(t)

	RecordHealthAttempt(HealthAttempt{
		ChannelID:     1,
		ChannelKeyID:  11,
		ModelName:     "gpt-test",
		Status:        model.AttemptFailed,
		HTTPStatus:    200,
		FailureReason: "response validation failed: empty_choices",
	})

	group := model.Group{
		Mode: model.GroupModeFailover,
		Items: []model.GroupItem{
			{ID: 1, ChannelID: 1, ModelName: "gpt-test", Priority: 1, Weight: 1},
		},
	}
	iter := NewIterator(group, 0, "gpt-test")
	if !iter.Next() {
		t.Fatal("expected first candidate")
	}
	if !iter.SkipHealthCooldown(1, 11, "bad-channel", "https://example.test") {
		t.Fatal("expected health cooldown skip")
	}
	attempts := iter.Attempts()
	if len(attempts) != 1 {
		t.Fatalf("attempt count = %d, want 1", len(attempts))
	}
	if attempts[0].Status != model.AttemptCircuitBreak {
		t.Fatalf("attempt status = %q, want circuit_break", attempts[0].Status)
	}
	if attempts[0].FailureReason != "health_cooldown_active" {
		t.Fatalf("failure reason = %q, want health_cooldown_active", attempts[0].FailureReason)
	}
}
