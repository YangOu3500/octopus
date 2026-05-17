package op

import (
	"testing"

	"github.com/bestruirui/octopus/internal/model"
)

func TestRelayLogListWithQueryFiltersAndPaginates(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	resetRelayLogCacheForTest(t)

	cacheRead := 12
	entries := []model.RelayLog{
		{
			Time:              100,
			TraceID:           "trace-failover",
			ClientAPIKeyID:    7,
			RequestAPIKeyName: "ops-key",
			RequestModelName:  "gpt-4o",
			ActualModelName:   "gpt-4o-upstream",
			FinalStatus:       "success",
			RequestStream:     false,
			ChannelId:         2,
			ChannelName:       "good",
			Ftut:              120,
			UseTime:           900,
			TotalLatencyMS:    900,
			InputTokens:       100,
			OutputTokens:      40,
			CacheReadTokens:   &cacheRead,
			TotalAttemptCost:  0.002,
			AttemptsCount:     2,
			Attempts: []model.ChannelAttempt{
				{
					AttemptIndex:    1,
					ChannelID:       1,
					ChannelName:     "bad",
					ModelName:       "gpt-4o",
					UpstreamModel:   "gpt-4o-bad",
					RequestProtocol: "openai_chat",
					Status:          model.AttemptFailed,
					HTTPStatus:      200,
					FailureReason:   "empty_choices",
					DurationMS:      150,
				},
				{
					AttemptIndex:    2,
					ChannelID:       2,
					ChannelName:     "good",
					ModelName:       "gpt-4o",
					UpstreamModel:   "gpt-4o-ok",
					RequestProtocol: "openai_chat",
					Status:          model.AttemptSuccess,
					HTTPStatus:      200,
					DurationMS:      700,
				},
			},
		},
		{
			Time:             200,
			TraceID:          "trace-server",
			RequestModelName: "claude-3",
			FinalStatus:      "failed",
			RequestStream:    true,
			ChannelId:        3,
			ChannelName:      "server-error",
			Error:            "upstream error",
			Ftut:             0,
			UseTime:          300,
			AttemptsCount:    1,
			Attempts: []model.ChannelAttempt{{
				AttemptIndex:    1,
				ChannelID:       3,
				ChannelName:     "server-error",
				ModelName:       "claude-3",
				RequestProtocol: "anthropic",
				Status:          model.AttemptFailed,
				HTTPStatus:      502,
				FailureReason:   "server_error",
				DurationMS:      300,
			}},
		},
		{
			Time:             300,
			TraceID:          "trace-other",
			RequestModelName: "gemini-pro",
			FinalStatus:      "success",
			RequestStream:    false,
			ChannelId:        4,
			ChannelName:      "gemini",
			Ftut:             90,
			UseTime:          500,
			InputTokens:      20,
			OutputTokens:     10,
			AttemptsCount:    1,
			Attempts: []model.ChannelAttempt{{
				AttemptIndex:    1,
				ChannelID:       4,
				ChannelName:     "gemini",
				ModelName:       "gemini-pro",
				RequestProtocol: "gemini",
				Status:          model.AttemptSuccess,
				HTTPStatus:      200,
				DurationMS:      500,
			}},
		},
	}

	for _, entry := range entries {
		if err := RelayLogAdd(ctx, entry); err != nil {
			t.Fatalf("RelayLogAdd failed: %v", err)
		}
	}

	result, err := RelayLogListWithQuery(ctx, model.RelayLogListQuery{
		Page:          1,
		PageSize:      10,
		Model:         "gpt-4o",
		APIKey:        "ops",
		Status:        "success",
		HTTPStatus:    "200",
		FailureReason: "empty_choices",
		Protocol:      "openai_chat",
		Stream:        boolPtr(false),
		Failover:      boolPtr(true),
		CacheHit:      boolPtr(true),
	})
	if err != nil {
		t.Fatalf("RelayLogListWithQuery failed: %v", err)
	}
	if result.Total != 1 || len(result.Items) != 1 || result.Items[0].TraceID != "trace-failover" {
		t.Fatalf("unexpected filtered result: total=%d items=%+v", result.Total, result.Items)
	}

	result, err = RelayLogListWithQuery(ctx, model.RelayLogListQuery{
		Page:       1,
		PageSize:   10,
		HTTPStatus: "5xx",
		Stream:     boolPtr(true),
	})
	if err != nil {
		t.Fatalf("RelayLogListWithQuery 5xx failed: %v", err)
	}
	if result.Total != 1 || result.Items[0].TraceID != "trace-server" {
		t.Fatalf("unexpected 5xx result: %+v", result)
	}

	result, err = RelayLogListWithQuery(ctx, model.RelayLogListQuery{
		Page:      1,
		PageSize:  2,
		SortBy:    "time",
		SortOrder: "desc",
	})
	if err != nil {
		t.Fatalf("RelayLogListWithQuery page failed: %v", err)
	}
	if result.Total != 3 || !result.HasMore || len(result.Items) != 2 || result.Items[0].TraceID != "trace-other" {
		t.Fatalf("unexpected paged result: %+v", result)
	}
}

func resetRelayLogCacheForTest(t *testing.T) {
	t.Helper()
	relayLogCacheLock.Lock()
	relayLogCache = make([]model.RelayLog, 0, relayLogMaxSize)
	relayLogCacheLock.Unlock()
	t.Cleanup(func() {
		relayLogCacheLock.Lock()
		relayLogCache = make([]model.RelayLog, 0, relayLogMaxSize)
		relayLogCacheLock.Unlock()
	})
}

func boolPtr(value bool) *bool {
	return &value
}
