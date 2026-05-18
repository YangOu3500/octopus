package grouphealth

import (
	"testing"
	"time"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/relay/balancer"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

func TestBuildChannelModelHealthAggregatesAttemptsAndRuntimeHealth(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	balancer.Reset()
	t.Cleanup(balancer.Reset)

	if err := op.RelayLogClear(ctx); err != nil {
		t.Fatalf("RelayLogClear failed: %v", err)
	}
	if err := op.SettingSetString(model.SettingKeyHealthScoreEnabled, "true"); err != nil {
		t.Fatalf("SettingSetString failed: %v", err)
	}

	channel := &model.Channel{
		Name:     "health-openai",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://health.example.test/v1"}},
		Model:    "gpt-4o",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-health-secret"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}
	storedChannel, err := op.ChannelGet(channel.ID, ctx)
	if err != nil {
		t.Fatalf("ChannelGet failed: %v", err)
	}
	usedKey := storedChannel.GetChannelKey()

	balancer.RecordHealthAttempt(balancer.HealthAttempt{
		ChannelID:    channel.ID,
		ChannelKeyID: usedKey.ID,
		ModelName:    "gpt-4o",
		Status:       model.AttemptSuccess,
		HTTPStatus:   200,
		TTFBMS:       90,
		TotalMS:      300,
	})
	balancer.RecordHealthAttempt(balancer.HealthAttempt{
		ChannelID:     channel.ID,
		ChannelKeyID:  usedKey.ID,
		ModelName:     "gpt-4o",
		BaseURL:       storedChannel.GetBaseUrl(),
		Status:        model.AttemptFailed,
		HTTPStatus:    200,
		FailureReason: "response validation failed: empty_choices",
		TotalMS:       1200,
	})

	now := time.Now().Unix()
	entry := model.RelayLog{
		Time:             now,
		TraceID:          "trace-channel-health",
		RequestModelName: "gpt-4o",
		ActualModelName:  "gpt-4o",
		FinalStatus:      "success",
		RequestSource:    "relay",
		ChannelId:        channel.ID,
		ChannelName:      channel.Name,
		AttemptsCount:    2,
		Attempts: []model.ChannelAttempt{
			{
				AttemptIndex:  1,
				ChannelID:     channel.ID,
				ChannelName:   channel.Name,
				ModelName:     "gpt-4o",
				Status:        model.AttemptFailed,
				HTTPStatus:    200,
				FailureReason: "empty_choices",
				TTFBMS:        80,
				TotalMS:       250,
				InputTokens:   20,
				EstimatedCost: 0.001,
			},
			{
				AttemptIndex:  2,
				ChannelID:     channel.ID,
				ChannelName:   channel.Name,
				ModelName:     "gpt-4o",
				Status:        model.AttemptSuccess,
				HTTPStatus:    200,
				TTFBMS:        100,
				TotalMS:       500,
				InputTokens:   30,
				OutputTokens:  15,
				CacheTokens:   5,
				EstimatedCost: 0.003,
			},
		},
	}
	if err := op.RelayLogAdd(ctx, entry); err != nil {
		t.Fatalf("RelayLogAdd failed: %v", err)
	}

	result, err := BuildChannelModelHealth(ctx, model.ChannelModelHealthQuery{TimeRange: "all"})
	if err != nil {
		t.Fatalf("BuildChannelModelHealth failed: %v", err)
	}
	if !result.Summary.HealthScoreEnabled || result.Summary.LoadBalancingStrategy != "health_score" {
		t.Fatalf("expected health score strategy summary, got %+v", result.Summary)
	}

	row := findChannelModelHealthRow(result.Rows, channel.ID, "gpt-4o")
	if row == nil {
		t.Fatalf("expected channel/model row, got %+v", result.Rows)
	}
	if row.RequestCount != 2 || row.SuccessCount != 1 || row.FailureCount != 1 {
		t.Fatalf("unexpected row counts: %+v", row)
	}
	if row.InputTokens != 50 || row.OutputTokens != 15 || row.CacheTokens != 5 {
		t.Fatalf("unexpected token totals: %+v", row)
	}
	if row.HealthSampleCount != 2 || row.HealthSuccessCount != 1 || row.HealthFailureCount != 1 {
		t.Fatalf("unexpected health samples: %+v", row)
	}
	if !row.CoolingDown || row.CooldownRemainingMS <= 0 || row.CooldownReason == "" {
		t.Fatalf("expected active cooldown state: %+v", row)
	}
	if row.AvgTTFBMS != 90 || row.AvgTotalMS != 375 {
		t.Fatalf("unexpected latency averages: %+v", row)
	}
}

func TestBuildChannelModelHealthShowsProjectedQuotaMetadata(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)

	channel := &model.Channel{
		Name:     "health-managed",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://managed-health.example.test/v1"}},
		Model:    "managed-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-managed-secret"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}
	siteID, accountID := createProbeSite(t)
	createProbeBinding(t, siteID, accountID, channel.ID, "managed-model", false)

	result, err := BuildChannelModelHealth(ctx, model.ChannelModelHealthQuery{TimeRange: "all"})
	if err != nil {
		t.Fatalf("BuildChannelModelHealth failed: %v", err)
	}
	row := findChannelModelHealthRow(result.Rows, channel.ID, "managed-model")
	if row == nil {
		t.Fatalf("expected managed row, got %+v", result.Rows)
	}
	if !row.Managed || row.SiteID != siteID || row.SiteAccountID != accountID {
		t.Fatalf("expected managed site/account metadata, got %+v", row)
	}
	if row.QuotaStatus != "unknown" {
		t.Fatalf("quota status = %q, want unknown for unsynced zero account", row.QuotaStatus)
	}
}

func TestBuildChannelModelHealthShowsKeyCapacityStatus(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	observedAt := time.Now().Unix()

	channel := &model.Channel{
		Name:     "health-key-capacity",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://health-key-capacity.example.test/v1"}},
		Model:    "capacity-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-capacity-secret", StatusCode: 429, LastUseTimeStamp: observedAt}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}

	result, err := BuildChannelModelHealth(ctx, model.ChannelModelHealthQuery{TimeRange: "all"})
	if err != nil {
		t.Fatalf("BuildChannelModelHealth failed: %v", err)
	}
	row := findChannelModelHealthRow(result.Rows, channel.ID, "capacity-model")
	if row == nil {
		t.Fatalf("expected channel/model row, got %+v", result.Rows)
	}
	if row.QuotaStatus != "rate_limited" || row.QuotaReason != "http_429" {
		t.Fatalf("unexpected quota status: %+v", row)
	}
	if row.CapacityStatus != "blocked" ||
		row.CapacityReason != "http_429" ||
		row.CapacityScope != "channel_key" ||
		row.CapacitySource != "key_status_code" ||
		row.LastObservedAt != observedAt {
		t.Fatalf("unexpected structured capacity status: %+v", row)
	}
	if result.Summary.QuotaStatusCounts["rate_limited"] == 0 ||
		result.Summary.CapacityBlockedCount != result.Summary.QuotaStatusCounts["rate_limited"] {
		t.Fatalf("unexpected quota summary: %+v", result.Summary)
	}

	filtered, err := BuildChannelModelHealth(ctx, model.ChannelModelHealthQuery{TimeRange: "all", QuotaStatus: "rate_limited"})
	if err != nil {
		t.Fatalf("BuildChannelModelHealth with quota filter failed: %v", err)
	}
	if len(filtered.Rows) == 0 {
		t.Fatalf("expected rate-limited rows, got none")
	}
	for _, row := range filtered.Rows {
		if row.QuotaStatus != "rate_limited" {
			t.Fatalf("expected only rate-limited rows, got %+v", filtered.Rows)
		}
	}
	available, err := BuildChannelModelHealth(ctx, model.ChannelModelHealthQuery{TimeRange: "all", QuotaStatus: "available"})
	if err != nil {
		t.Fatalf("BuildChannelModelHealth with available filter failed: %v", err)
	}
	if len(available.Rows) != 0 {
		t.Fatalf("expected available filter to exclude rate-limited row, got %+v", available.Rows)
	}
}

func TestBuildChannelModelHealthUsesFallbackKeyWhenPrimaryKeyHardBlocked(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	observedAt := time.Now().Unix()

	channel := &model.Channel{
		Name:     "health-hard-blocked-fallback",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://health-hard-blocked-fallback.example.test/v1"}},
		Model:    "fallback-model",
		Keys: []model.ChannelKey{
			{Enabled: true, ChannelKey: "sk-hard-blocked", TotalCost: 1, StatusCode: 402, LastUseTimeStamp: observedAt},
			{Enabled: true, ChannelKey: "sk-fallback", TotalCost: 100},
		},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}

	result, err := BuildChannelModelHealth(ctx, model.ChannelModelHealthQuery{TimeRange: "all"})
	if err != nil {
		t.Fatalf("BuildChannelModelHealth failed: %v", err)
	}
	row := findChannelModelHealthRow(result.Rows, channel.ID, "fallback-model")
	if row == nil {
		t.Fatalf("expected channel/model row, got %+v", result.Rows)
	}
	if row.QuotaStatus == "quota_error" || row.CapacityStatus == "blocked" {
		t.Fatalf("expected fallback key to keep row available, got %+v", row)
	}
}

func TestBuildChannelModelHealthShowsBlockedMetaWhenAllKeysHardBlocked(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	observedAt := time.Now().Unix()

	channel := &model.Channel{
		Name:     "health-all-hard-blocked",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://health-all-hard-blocked.example.test/v1"}},
		Model:    "blocked-model",
		Keys: []model.ChannelKey{
			{Enabled: true, ChannelKey: "sk-quota-blocked", TotalCost: 1, StatusCode: 402, LastUseTimeStamp: observedAt},
			{Enabled: true, ChannelKey: "sk-auth-blocked", TotalCost: 2, StatusCode: 401, LastUseTimeStamp: observedAt},
		},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}

	result, err := BuildChannelModelHealth(ctx, model.ChannelModelHealthQuery{TimeRange: "all"})
	if err != nil {
		t.Fatalf("BuildChannelModelHealth failed: %v", err)
	}
	row := findChannelModelHealthRow(result.Rows, channel.ID, "blocked-model")
	if row == nil {
		t.Fatalf("expected channel/model row, got %+v", result.Rows)
	}
	if row.QuotaStatus != "quota_error" || row.QuotaReason != "http_402" {
		t.Fatalf("unexpected quota status: %+v", row)
	}
	if row.CapacityStatus != "blocked" ||
		row.CapacityReason != "http_402" ||
		row.CapacityScope != "channel_key" ||
		row.CapacitySource != "key_status_code" {
		t.Fatalf("unexpected structured capacity status: %+v", row)
	}
}

func findChannelModelHealthRow(rows []model.ChannelModelHealthRow, channelID int, modelName string) *model.ChannelModelHealthRow {
	for i := range rows {
		if rows[i].ChannelID == channelID && rows[i].ModelName == modelName {
			return &rows[i]
		}
	}
	return nil
}
