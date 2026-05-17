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

func TestHealthSchedulingActiveSelectionSpreadsBurstWithinTie(t *testing.T) {
	Reset()
	enableHealthForTest(t)

	group := model.Group{
		Mode: model.GroupModeFailover,
		Items: []model.GroupItem{
			{ID: 1, ChannelID: 1, ModelName: "gpt-test", Priority: 1, Weight: 1},
			{ID: 2, ChannelID: 2, ModelName: "gpt-test", Priority: 1, Weight: 1},
		},
	}

	first := NewIterator(group, 0, "gpt-test")
	if !first.Next() {
		t.Fatal("expected first candidate")
	}
	if got := first.Item().ChannelID; got != 1 {
		t.Fatalf("first channel = %d, want 1", got)
	}
	span := first.StartAttempt(1, 11, "first")
	if got := ActiveSelectionCount(1, "gpt-test"); got != 1 {
		t.Fatalf("active selections for first = %d, want 1", got)
	}

	second := NewIterator(group, 0, "gpt-test")
	if !second.Next() {
		t.Fatal("expected second candidate")
	}
	if got := second.Item().ChannelID; got != 2 {
		t.Fatalf("second channel = %d, want 2 while first is active", got)
	}

	span.End(model.AttemptSuccess, 200, "")
	if got := ActiveSelectionCount(1, "gpt-test"); got != 0 {
		t.Fatalf("active selections after end = %d, want 0", got)
	}
}

func TestActiveSelectionTrackerDisabledWithoutHealthScheduling(t *testing.T) {
	Reset()
	t.Cleanup(Reset)

	group := model.Group{
		Mode: model.GroupModeFailover,
		Items: []model.GroupItem{
			{ID: 1, ChannelID: 1, ModelName: "gpt-test", Priority: 1, Weight: 1},
			{ID: 2, ChannelID: 2, ModelName: "gpt-test", Priority: 1, Weight: 1},
		},
	}

	first := NewIterator(group, 0, "gpt-test")
	if !first.Next() {
		t.Fatal("expected first candidate")
	}
	span := first.StartAttempt(1, 11, "first")
	defer span.End(model.AttemptSuccess, 200, "")
	if got := ActiveSelectionCount(1, "gpt-test"); got != 0 {
		t.Fatalf("active selections with health disabled = %d, want 0", got)
	}

	second := NewIterator(group, 0, "gpt-test")
	if !second.Next() {
		t.Fatal("expected second candidate")
	}
	if got := second.Item().ChannelID; got != 1 {
		t.Fatalf("second channel with health disabled = %d, want unchanged failover first channel", got)
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

func TestHealthCooldownUsesManagedAccountAndSiteScopes(t *testing.T) {
	Reset()
	enableHealthForTest(t)

	RecordHealthAttempt(HealthAttempt{
		ChannelID:     1,
		ChannelKeyID:  11,
		SiteAccountID: 77,
		ModelName:     "gpt-test",
		Status:        model.AttemptFailed,
		HTTPStatus:    402,
		FailureReason: "insufficient_quota",
	})

	cooling, _, reason := IsHealthCoolingDownWithScope(2, 22, 0, 77, "gpt-test", "")
	if !cooling || reason != "quota_error" {
		t.Fatalf("expected account scoped quota cooldown, cooling=%v reason=%q", cooling, reason)
	}
	cooling, _, _ = IsHealthCoolingDownWithScope(2, 22, 0, 88, "gpt-test", "")
	if cooling {
		t.Fatal("did not expect quota cooldown for a different account")
	}

	RecordHealthAttempt(HealthAttempt{
		ChannelID:     3,
		ChannelKeyID:  33,
		SiteID:        55,
		ModelName:     "gpt-test",
		Status:        model.AttemptFailed,
		HTTPStatus:    503,
		FailureReason: "server_error",
	})
	cooling, _, reason = IsHealthCoolingDownWithScope(4, 44, 55, 0, "gpt-test", "")
	if !cooling || reason != "server_error" {
		t.Fatalf("expected site scoped server cooldown, cooling=%v reason=%q", cooling, reason)
	}
}

func TestListHealthCooldownPoliciesMatchesRuntimeRules(t *testing.T) {
	policies := ListHealthCooldownPolicies()
	if len(policies) == 0 {
		t.Fatal("expected cooldown policies")
	}

	byReason := make(map[string]HealthCooldownPolicy, len(policies))
	for _, policy := range policies {
		byReason[policy.Reason] = policy
		if !policy.ModelScoped {
			t.Fatalf("policy %s should be model-scoped", policy.Reason)
		}
		if !policy.HealthScoreRequired {
			t.Fatalf("policy %s should require health score scheduling", policy.Reason)
		}
		if !policy.ClearedOnSuccess {
			t.Fatalf("policy %s should clear on success", policy.Reason)
		}
	}

	assertPolicy := func(reason string, baseSeconds int, scopes []string, usesRetryAfter bool, backoff bool) {
		t.Helper()
		policy, ok := byReason[reason]
		if !ok {
			t.Fatalf("missing policy for %s", reason)
		}
		if policy.BaseSeconds != baseSeconds {
			t.Fatalf("%s base seconds = %d, want %d", reason, policy.BaseSeconds, baseSeconds)
		}
		if policy.UsesRetryAfter != usesRetryAfter {
			t.Fatalf("%s uses retry-after = %v, want %v", reason, policy.UsesRetryAfter, usesRetryAfter)
		}
		if policy.ExponentialBackoff != backoff {
			t.Fatalf("%s backoff = %v, want %v", reason, policy.ExponentialBackoff, backoff)
		}
		if len(policy.Scopes) != len(scopes) {
			t.Fatalf("%s scopes = %v, want %v", reason, policy.Scopes, scopes)
		}
		for i := range scopes {
			if policy.Scopes[i] != scopes[i] {
				t.Fatalf("%s scopes = %v, want %v", reason, policy.Scopes, scopes)
			}
		}
	}

	assertPolicy("auth_error", 300, []string{"key", "account"}, false, false)
	assertPolicy("quota_error", 1800, []string{"key", "account"}, false, false)
	assertPolicy("rate_limit", 60, []string{"key"}, true, true)
	assertPolicy("server_error", 120, []string{"channel", "site", "base_url"}, false, true)
	assertPolicy("timeout_error", 60, []string{"channel", "site", "base_url"}, false, true)
	assertPolicy("empty_choices", 30, []string{"channel"}, false, true)
	assertPolicy("invalid_sse", 30, []string{"channel"}, false, true)
	assertPolicy("html_or_login_page", 120, []string{"channel"}, false, true)
	assertPolicy("attempt_failed", 30, []string{"channel"}, false, true)
}
