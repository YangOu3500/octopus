package op

import (
	"encoding/json"
	"strings"
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

func TestRelayLogAddMirrorsRequestTraceTables(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	resetRelayLogCacheForTest(t)

	cacheRead := 3
	cacheWrite := 2
	wsMode := model.RelayLogWSModeContinuation
	wsRecovery := model.RelayLogWSRecoveryReplay
	entry := model.RelayLog{
		Time:               500,
		ThreadID:           "thread-1",
		ClientAPIKeyID:     17,
		GroupID:            23,
		RequestModelName:   "gpt-4o",
		ActualModelName:    "gpt-4o-final",
		RequestSource:      "relay",
		RequestStream:      true,
		ClientIP:           "10.1.2.3",
		ChannelId:          42,
		ChannelName:        "final",
		FinalStatus:        "success",
		FinalChannelID:     42,
		FinalSiteID:        7,
		FinalUpstreamModel: "gpt-4o-final",
		AttemptsCount:      2,
		TotalLatencyMS:     900,
		InputTokens:        120,
		OutputTokens:       45,
		CacheReadTokens:    &cacheRead,
		CacheWriteTokens:   &cacheWrite,
		EstimatedCost:      0.004,
		FinalSuccessCost:   0.003,
		TotalAttemptCost:   0.004,
		FailedAttemptCost:  0.001,
		ServiceTier:        "standard",
		UsedWS:             true,
		WSMode:             &wsMode,
		WSRecovery:         &wsRecovery,
		Attempts: []model.ChannelAttempt{
			{
				AttemptIndex:     1,
				AttemptNum:       1,
				ChannelID:        41,
				ChannelKeyID:     410,
				KeyID:            411,
				ChannelName:      "bad",
				SiteID:           6,
				SiteAccountID:    61,
				AccountID:        62,
				BaseURL:          "https://user:secret@api.example.com/v1?token=hidden",
				ModelName:        "gpt-4o",
				UpstreamModel:    "gpt-4o-bad",
				RequestProtocol:  "openai_chat",
				UpstreamProtocol: "openai_chat",
				ResponseProtocol: "openai_chat",
				Status:           model.AttemptFailed,
				HTTPStatus:       200,
				FailureReason:    "empty_choices",
				Retryable:        true,
				DurationMS:       180,
				TTFBMS:           50,
				TotalMS:          180,
				InputTokens:      120,
				EstimatedCost:    0.001,
				CostIncurred:     "unknown",
				CostSource:       "estimated_input",
				ServiceTier:      "standard",
				ErrorSummary:     "Authorization: Bearer secret-token",
				CreatedAt:        501,
			},
			{
				AttemptIndex:  2,
				AttemptNum:    1,
				ChannelID:     42,
				ChannelName:   "final",
				SiteID:        7,
				ModelName:     "gpt-4o",
				UpstreamModel: "gpt-4o-final",
				Status:        model.AttemptSuccess,
				HTTPStatus:    200,
				DurationMS:    700,
				TTFBMS:        90,
				InputTokens:   120,
				OutputTokens:  45,
				CacheTokens:   5,
				InputCost:     0.001,
				OutputCost:    0.002,
				EstimatedCost: 0.003,
				CreatedAt:     502,
			},
		},
	}

	saved, err := RelayLogAddWithResult(ctx, entry)
	if err != nil {
		t.Fatalf("RelayLogAddWithResult failed: %v", err)
	}

	trace, err := RequestTraceGetByTraceID(ctx, saved.TraceID)
	if err != nil {
		t.Fatalf("RequestTraceGetByTraceID failed: %v", err)
	}
	if trace.ID != saved.ID || trace.RelayLogID != saved.ID || trace.TraceID != saved.TraceID {
		t.Fatalf("unexpected trace identity: trace=%+v saved=%+v", trace, saved)
	}
	if trace.ClientModel != "gpt-4o" || trace.FinalUpstreamModel != "gpt-4o-final" || trace.FinalStatus != "success" {
		t.Fatalf("unexpected trace model/status fields: %+v", trace)
	}
	if trace.AttemptsCount != 2 || trace.TotalLatencyMS != 900 || trace.CacheTokens != 5 {
		t.Fatalf("unexpected trace totals: %+v", trace)
	}
	if !trace.UsedWS || trace.WSMode != string(wsMode) || trace.WSRecovery != string(wsRecovery) {
		t.Fatalf("unexpected websocket trace fields: %+v", trace)
	}

	attempts, err := RequestAttemptsByTraceID(ctx, saved.TraceID)
	if err != nil {
		t.Fatalf("RequestAttemptsByTraceID failed: %v", err)
	}
	if len(attempts) != 2 {
		t.Fatalf("expected two mirrored attempts, got %+v", attempts)
	}
	if attempts[0].RelayLogID != saved.ID || attempts[0].AttemptIndex != 1 || attempts[0].Status != model.AttemptFailed || !attempts[0].Retryable {
		t.Fatalf("unexpected failed attempt mirror: %+v", attempts[0])
	}
	if attempts[0].BaseURL != "https://api.example.com/v1" {
		t.Fatalf("expected base url credentials and query to be stripped, got %q", attempts[0].BaseURL)
	}
	if strings.Contains(attempts[0].ErrorSummary, "secret-token") || !strings.Contains(attempts[0].ErrorSummary, "[REDACTED]") {
		t.Fatalf("expected attempt error summary to be redacted, got %q", attempts[0].ErrorSummary)
	}
	if attempts[1].AttemptIndex != 2 || attempts[1].Status != model.AttemptSuccess || attempts[1].OutputTokens != 45 || attempts[1].EstimatedCost != 0.003 {
		t.Fatalf("unexpected success attempt mirror: %+v", attempts[1])
	}
}

func TestRequestTraceListAndDetailReadFromMirrorTables(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	resetRelayLogCacheForTest(t)

	entry := model.RelayLog{
		Time:               800,
		TraceID:            "trace-table-failover",
		ThreadID:           "thread-table",
		ClientAPIKeyID:     99,
		GroupID:            12,
		RequestModelName:   "gpt-4o",
		ActualModelName:    "gpt-4o-final",
		RequestSource:      "relay",
		RequestStream:      true,
		ClientIP:           "172.16.1.20",
		ChannelId:          22,
		ChannelName:        "final",
		FinalStatus:        "success",
		FinalChannelID:     22,
		FinalSiteID:        5,
		AttemptsCount:      2,
		TotalLatencyMS:     1000,
		InputTokens:        20,
		OutputTokens:       10,
		TotalAttemptCost:   0.003,
		RequestContent:     `{"authorization":"Bearer secret-token","api_key":"sk-live-secret"}`,
		ResponseContent:    `{"set-cookie":"session=secret-token","choices":[{"message":{"content":"ok"}}]}`,
		FinalUpstreamModel: "gpt-4o-final",
		Attempts: []model.ChannelAttempt{
			{
				AttemptIndex:    1,
				ChannelID:       21,
				ChannelKeyID:    210,
				ChannelName:     "bad",
				SiteID:          4,
				AccountID:       40,
				BaseURL:         "https://user:secret@example.test/v1?token=secret-token#frag",
				ModelName:       "gpt-4o",
				UpstreamModel:   "gpt-4o-bad",
				RequestProtocol: "openai_chat",
				Status:          model.AttemptFailed,
				HTTPStatus:      502,
				FailureReason:   "server_error",
				Retryable:       true,
				DurationMS:      300,
				TTFBMS:          100,
				TotalMS:         300,
				ErrorSummary:    "Cookie: session=secret-token",
			},
			{
				AttemptIndex:    2,
				ChannelID:       22,
				ChannelName:     "final",
				SiteID:          5,
				ModelName:       "gpt-4o",
				UpstreamModel:   "gpt-4o-final",
				RequestProtocol: "openai_chat",
				Status:          model.AttemptSuccess,
				HTTPStatus:      200,
				DurationMS:      700,
				TTFBMS:          120,
				TotalMS:         700,
				InputTokens:     20,
				OutputTokens:    10,
				EstimatedCost:   0.002,
			},
		},
	}
	saved, err := RelayLogAddWithResult(ctx, entry)
	if err != nil {
		t.Fatalf("RelayLogAddWithResult failed: %v", err)
	}

	if _, err := RelayLogAddWithResult(ctx, model.RelayLog{
		Time:             700,
		TraceID:          "trace-table-other",
		ClientAPIKeyID:   100,
		RequestModelName: "claude-3",
		RequestSource:    "model_test",
		FinalStatus:      "failed",
		AttemptsCount:    1,
		Attempts: []model.ChannelAttempt{{
			AttemptIndex:    1,
			ChannelID:       30,
			ModelName:       "claude-3",
			RequestProtocol: "anthropic",
			Status:          model.AttemptFailed,
			HTTPStatus:      400,
			FailureReason:   "bad_request",
		}},
	}); err != nil {
		t.Fatalf("RelayLogAddWithResult second entry failed: %v", err)
	}

	result, err := RequestTraceList(ctx, model.RequestTraceListQuery{
		Page:          1,
		PageSize:      10,
		ChannelIDs:    []int{21},
		Model:         "gpt-4o",
		TraceID:       "failover",
		APIKeyID:      intPtr(99),
		Status:        "success",
		HTTPStatus:    "5xx",
		FailureReason: "server",
		Protocol:      "openai",
		Source:        "relay",
		Stream:        boolPtr(true),
		Failover:      boolPtr(true),
		SortBy:        "time",
		SortOrder:     "desc",
	})
	if err != nil {
		t.Fatalf("RequestTraceList failed: %v", err)
	}
	if result.Total != 1 || len(result.Items) != 1 || result.Items[0].TraceID != saved.TraceID {
		t.Fatalf("unexpected trace list result: %+v", result)
	}
	if result.Items[0].ClientModel != "gpt-4o" || result.Items[0].AttemptsCount != 2 || result.Items[0].TotalLatencyMS != 1000 {
		t.Fatalf("unexpected trace summary: %+v", result.Items[0])
	}

	detail, err := RequestTraceDetailByTraceID(ctx, saved.TraceID)
	if err != nil {
		t.Fatalf("RequestTraceDetailByTraceID failed: %v", err)
	}
	if detail.Trace.TraceID != saved.TraceID || len(detail.Attempts) != 2 {
		t.Fatalf("unexpected trace detail: %+v", detail)
	}
	if detail.Attempts[0].BaseURL != "https://example.test/v1" {
		t.Fatalf("expected sanitized attempt base url, got %q", detail.Attempts[0].BaseURL)
	}
	if strings.Contains(detail.Attempts[0].ErrorSummary, "secret-token") || !strings.Contains(detail.Attempts[0].ErrorSummary, "[REDACTED]") {
		t.Fatalf("expected sanitized attempt error summary, got %q", detail.Attempts[0].ErrorSummary)
	}
	encoded, err := json.Marshal(detail)
	if err != nil {
		t.Fatalf("marshal detail failed: %v", err)
	}
	for _, forbidden := range []string{"request_content", "response_content", "sk-live-secret", "secret-token"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("trace detail leaked forbidden value %q: %s", forbidden, string(encoded))
		}
	}
}

func TestRelayLogMirrorRespectsKeepDisabledAndClear(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	resetRelayLogCacheForTest(t)
	if err := settingRefreshCache(ctx); err != nil {
		t.Fatalf("settingRefreshCache failed: %v", err)
	}
	if err := SettingSetString(model.SettingKeyRelayLogKeepEnabled, "false"); err != nil {
		t.Fatalf("disable relay log keep failed: %v", err)
	}
	t.Cleanup(func() {
		settingCache.Set(model.SettingKeyRelayLogKeepEnabled, "true")
	})

	disabledSaved, err := RelayLogAddWithResult(ctx, model.RelayLog{
		Time:             600,
		RequestModelName: "disabled",
		Attempts: []model.ChannelAttempt{{
			AttemptIndex: 1,
			ChannelID:    1,
			Status:       model.AttemptSuccess,
		}},
	})
	if err != nil {
		t.Fatalf("RelayLogAddWithResult with keep disabled failed: %v", err)
	}
	if _, err := RequestTraceGetByTraceID(ctx, disabledSaved.TraceID); !RelayLogIsNotFound(err) {
		t.Fatalf("expected disabled relay log keep to skip trace mirror, got err=%v", err)
	}

	if err := SettingSetString(model.SettingKeyRelayLogKeepEnabled, "true"); err != nil {
		t.Fatalf("enable relay log keep failed: %v", err)
	}
	enabledSaved, err := RelayLogAddWithResult(ctx, model.RelayLog{
		Time:             700,
		RequestModelName: "enabled",
		Attempts: []model.ChannelAttempt{{
			AttemptIndex: 1,
			ChannelID:    2,
			Status:       model.AttemptSuccess,
		}},
	})
	if err != nil {
		t.Fatalf("RelayLogAddWithResult with keep enabled failed: %v", err)
	}
	if _, err := RequestTraceGetByTraceID(ctx, enabledSaved.TraceID); err != nil {
		t.Fatalf("expected enabled relay log keep to mirror trace: %v", err)
	}

	if err := RelayLogClear(ctx); err != nil {
		t.Fatalf("RelayLogClear failed: %v", err)
	}
	if _, err := RequestTraceGetByTraceID(ctx, enabledSaved.TraceID); !RelayLogIsNotFound(err) {
		t.Fatalf("expected RelayLogClear to delete mirrored trace, got err=%v", err)
	}
	attempts, err := RequestAttemptsByTraceID(ctx, enabledSaved.TraceID)
	if err != nil {
		t.Fatalf("RequestAttemptsByTraceID after clear failed: %v", err)
	}
	if len(attempts) != 0 {
		t.Fatalf("expected RelayLogClear to delete mirrored attempts, got %+v", attempts)
	}
}

func TestRelayLogListOmitsBodyAndDetailRedacts(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	resetRelayLogCacheForTest(t)

	entry := model.RelayLog{
		Time:             400,
		TraceID:          "trace-sensitive",
		RequestModelName: "gpt-4o",
		ActualModelName:  "gpt-4o",
		FinalStatus:      "success",
		RequestSource:    "relay",
		ClientIP:         "192.168.1.25",
		ChannelId:        9,
		ChannelName:      "redaction",
		RequestContent:   `{"model":"gpt-4o","authorization":"Bearer secret-token","messages":[{"role":"user","content":"hello"}]}`,
		ResponseContent:  `{"id":"ok","api_key":"sk-test123456789","choices":[{"message":{"content":"ok"}}]}`,
		Attempts: []model.ChannelAttempt{{
			AttemptIndex:  1,
			ChannelID:     9,
			ChannelName:   "redaction",
			ModelName:     "gpt-4o",
			Status:        model.AttemptSuccess,
			HTTPStatus:    200,
			DurationMS:    100,
			ErrorSummary:  "Authorization: Bearer secret-token",
			UpstreamModel: "gpt-4o",
		}},
	}

	if err := RelayLogAdd(ctx, entry); err != nil {
		t.Fatalf("RelayLogAdd failed: %v", err)
	}

	result, err := RelayLogListWithQuery(ctx, model.RelayLogListQuery{
		Page:     1,
		PageSize: 10,
		Source:   "relay",
	})
	if err != nil {
		t.Fatalf("RelayLogListWithQuery failed: %v", err)
	}
	if result.Total != 1 || len(result.Items) != 1 {
		t.Fatalf("unexpected list result: %+v", result)
	}
	listItem := result.Items[0]
	if listItem.RequestContent != "" || listItem.ResponseContent != "" {
		t.Fatalf("expected list body to be omitted, got request=%q response=%q", listItem.RequestContent, listItem.ResponseContent)
	}
	if listItem.ClientIP != "192.168.1.25" || listItem.RequestSource != "relay" {
		t.Fatalf("expected client ip/source in list, got ip=%q source=%q", listItem.ClientIP, listItem.RequestSource)
	}

	detail, err := RelayLogGet(ctx, listItem.ID)
	if err != nil {
		t.Fatalf("RelayLogGet failed: %v", err)
	}
	for _, sensitive := range []string{"secret-token", "sk-test123456789"} {
		if strings.Contains(detail.RequestContent, sensitive) ||
			strings.Contains(detail.ResponseContent, sensitive) ||
			strings.Contains(detail.Attempts[0].ErrorSummary, sensitive) {
			t.Fatalf("expected sensitive value %q to be redacted: %+v", sensitive, detail)
		}
	}
	if !strings.Contains(detail.RequestContent, "[REDACTED]") || !strings.Contains(detail.ResponseContent, "[REDACTED]") {
		t.Fatalf("expected redacted markers in detail body, got request=%q response=%q", detail.RequestContent, detail.ResponseContent)
	}
}

func TestStatsObservabilityAggregatesRelayLogs(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	resetRelayLogCacheForTest(t)

	cacheRead := 5
	now := int64(1_700_000_000)
	entries := []model.RelayLog{
		{
			Time:               now - 60,
			TraceID:            "trace-failover-ok",
			ClientAPIKeyID:     11,
			RequestAPIKeyName:  "ops-key",
			RequestModelName:   "gpt-4o",
			ActualModelName:    "gpt-4o",
			FinalStatus:        "success",
			RequestSource:      "relay",
			ClientIP:           "10.0.0.8",
			ChannelId:          2,
			ChannelName:        "good",
			Ftut:               80,
			UseTime:            600,
			TotalLatencyMS:     600,
			InputTokens:        100,
			OutputTokens:       50,
			CacheReadTokens:    &cacheRead,
			FinalSuccessCost:   0.003,
			TotalAttemptCost:   0.004,
			FailedAttemptCost:  0.001,
			AttemptsCount:      2,
			FinalUpstreamModel: "gpt-4o-ok",
			Attempts: []model.ChannelAttempt{
				{
					AttemptIndex:  1,
					ChannelID:     1,
					ChannelName:   "bad",
					ModelName:     "gpt-4o",
					UpstreamModel: "gpt-4o-bad",
					Status:        model.AttemptFailed,
					HTTPStatus:    200,
					FailureReason: "empty_choices",
					DurationMS:    120,
					EstimatedCost: 0.001,
				},
				{
					AttemptIndex:  2,
					ChannelID:     2,
					ChannelName:   "good",
					ModelName:     "gpt-4o",
					UpstreamModel: "gpt-4o-ok",
					Status:        model.AttemptSuccess,
					HTTPStatus:    200,
					DurationMS:    500,
					EstimatedCost: 0.003,
				},
			},
		},
		{
			Time:             now - 30,
			TraceID:          "trace-failed",
			ClientAPIKeyID:   12,
			RequestModelName: "claude-3",
			ActualModelName:  "claude-3",
			FinalStatus:      "failed",
			RequestSource:    "model_test",
			RequestStream:    true,
			ChannelId:        3,
			ChannelName:      "server",
			Ftut:             0,
			UseTime:          300,
			TotalLatencyMS:   300,
			Error:            "server_error",
			AttemptsCount:    1,
			Attempts: []model.ChannelAttempt{{
				AttemptIndex:  1,
				ChannelID:     3,
				ChannelName:   "server",
				ModelName:     "claude-3",
				UpstreamModel: "claude-3",
				Status:        model.AttemptFailed,
				HTTPStatus:    502,
				FailureReason: "server_error",
				DurationMS:    300,
			}},
		},
	}

	for _, entry := range entries {
		if err := RelayLogAdd(ctx, entry); err != nil {
			t.Fatalf("RelayLogAdd failed: %v", err)
		}
	}

	start := int(now - 3600)
	end := int(now)
	query := normalizeRelayLogListQuery(model.RelayLogListQuery{StartTime: &start, EndTime: &end, Page: 1, PageSize: 100, SortBy: "time", SortOrder: "desc"})
	if _, err := relayLogCollect(ctx, query); err != nil {
		t.Fatalf("relayLogCollect precheck failed: %v", err)
	}

	summary, err := StatsObservability(ctx, "all")
	if err != nil {
		t.Fatalf("StatsObservability failed: %v", err)
	}
	if summary.TotalRequests != 2 || summary.SuccessRequests != 1 || summary.FailedRequests != 1 {
		t.Fatalf("unexpected request summary: %+v", summary)
	}
	if summary.FailoverRequests != 1 {
		t.Fatalf("expected one failover request, got %+v", summary)
	}
	if summary.StreamRequests != 1 || summary.NonStreamRequests != 1 || summary.ModelTestRequests != 1 || summary.RelayRequests != 1 {
		t.Fatalf("unexpected source/stream summary: %+v", summary)
	}
	if summary.TotalAttempts != 3 || summary.MaxAttempts != 2 {
		t.Fatalf("unexpected attempt summary: %+v", summary)
	}
	if summary.InputTokens != 100 || summary.OutputTokens != 50 || summary.CacheTokens != 5 {
		t.Fatalf("unexpected token summary: %+v", summary)
	}
	if summary.FinalSuccessCost != 0.003 || summary.TotalAttemptCost != 0.004 || summary.FailedAttemptCost != 0.001 {
		t.Fatalf("unexpected cost summary: %+v", summary)
	}
	if len(summary.RecentFailures) == 0 || summary.RecentFailures[0].FailureReason == "" {
		t.Fatalf("expected recent failures with reason, got %+v", summary.RecentFailures)
	}
	if len(summary.TopChannels) == 0 || summary.TopChannels[0].Failures == 0 {
		t.Fatalf("expected top failing channels, got %+v", summary.TopChannels)
	}
	if len(summary.TopAPIKeys) == 0 || summary.TopAPIKeys[0].Name == "" {
		t.Fatalf("expected API key breakdown, got %+v", summary.TopAPIKeys)
	}
	if len(summary.SourceBreakdown) < 2 {
		t.Fatalf("expected source breakdown, got %+v", summary.SourceBreakdown)
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

func intPtr(value int) *int {
	return &value
}
