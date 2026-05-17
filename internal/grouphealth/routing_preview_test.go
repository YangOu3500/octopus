package grouphealth

import (
	"testing"
	"time"

	dbpkg "github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/relay/balancer"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

func TestBuildRoutingPreviewShowsHealthAndCooldown(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	balancer.Reset()
	t.Cleanup(balancer.Reset)

	if err := op.SettingSetString(model.SettingKeyHealthScoreEnabled, "true"); err != nil {
		t.Fatalf("SettingSetString failed: %v", err)
	}

	firstChannel := &model.Channel{
		Name:     "routing-first",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://first.example.test/v1"}},
		Model:    "preview-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-first-secret"}},
	}
	if err := op.ChannelCreate(firstChannel, ctx); err != nil {
		t.Fatalf("ChannelCreate first failed: %v", err)
	}
	secondChannel := &model.Channel{
		Name:     "routing-second",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://second.example.test/v1"}},
		Model:    "preview-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-second-secret"}},
	}
	if err := op.ChannelCreate(secondChannel, ctx); err != nil {
		t.Fatalf("ChannelCreate second failed: %v", err)
	}

	group := &model.Group{Name: "preview-group", Mode: model.GroupModeFailover}
	if err := op.GroupCreate(group, ctx); err != nil {
		t.Fatalf("GroupCreate failed: %v", err)
	}
	if err := op.GroupItemAdd(&model.GroupItem{GroupID: group.ID, ChannelID: firstChannel.ID, ModelName: "preview-model", Priority: 1, Weight: 1}, ctx); err != nil {
		t.Fatalf("GroupItemAdd first failed: %v", err)
	}
	if err := op.GroupItemAdd(&model.GroupItem{GroupID: group.ID, ChannelID: secondChannel.ID, ModelName: "preview-model", Priority: 1, Weight: 1}, ctx); err != nil {
		t.Fatalf("GroupItemAdd second failed: %v", err)
	}

	balancer.RecordHealthAttempt(balancer.HealthAttempt{
		ChannelID:     firstChannel.ID,
		ChannelKeyID:  firstChannel.Keys[0].ID,
		ModelName:     "preview-model",
		Status:        model.AttemptFailed,
		HTTPStatus:    200,
		FailureReason: "response validation failed: empty_choices",
		TotalMS:       1200,
	})
	balancer.RecordHealthAttempt(balancer.HealthAttempt{
		ChannelID:    secondChannel.ID,
		ChannelKeyID: secondChannel.Keys[0].ID,
		ModelName:    "preview-model",
		Status:       model.AttemptSuccess,
		HTTPStatus:   200,
		TTFBMS:       80,
		TotalMS:      200,
	})

	preview, err := BuildRoutingPreview(ctx, group.ID)
	if err != nil {
		t.Fatalf("BuildRoutingPreview failed: %v", err)
	}
	if !preview.HealthScoreEnabled {
		t.Fatal("expected health score enabled")
	}
	if len(preview.Candidates) != 2 {
		t.Fatalf("candidate count = %d, want 2", len(preview.Candidates))
	}
	if preview.Candidates[0].ChannelID != secondChannel.ID || preview.Candidates[0].Decision != "ready" {
		t.Fatalf("expected healthier candidate first, got %+v", preview.Candidates[0])
	}
	if preview.Candidates[0].SuccessRate != 1 || preview.Candidates[0].AvgTotalMS != 200 {
		t.Fatalf("unexpected successful candidate stats: %+v", preview.Candidates[0])
	}
	if preview.Candidates[1].ChannelID != firstChannel.ID || preview.Candidates[1].Decision != "health_cooldown" {
		t.Fatalf("expected failed candidate in cooldown, got %+v", preview.Candidates[1])
	}
	if !preview.Candidates[1].CoolingDown || preview.Candidates[1].CooldownRemainingMS <= 0 {
		t.Fatalf("expected cooldown remaining, got %+v", preview.Candidates[1])
	}
	if preview.Candidates[1].FailureCount != 1 || preview.Candidates[1].EmptyResponseRate != 1 {
		t.Fatalf("unexpected failed candidate stats: %+v", preview.Candidates[1])
	}
	if preview.Candidates[1].CooldownRemainingMS > int64((31 * time.Second).Milliseconds()) {
		t.Fatalf("cooldown remaining too large: %+v", preview.Candidates[1])
	}
}

func TestBuildRoutingPreviewShowsActiveSelectionPenalty(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	balancer.Reset()
	t.Cleanup(balancer.Reset)

	if err := op.SettingSetString(model.SettingKeyHealthScoreEnabled, "true"); err != nil {
		t.Fatalf("SettingSetString failed: %v", err)
	}

	firstChannel := &model.Channel{
		Name:     "routing-active-first",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://active-first.example.test/v1"}},
		Model:    "preview-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-first-secret"}},
	}
	if err := op.ChannelCreate(firstChannel, ctx); err != nil {
		t.Fatalf("ChannelCreate first failed: %v", err)
	}
	secondChannel := &model.Channel{
		Name:     "routing-active-second",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://active-second.example.test/v1"}},
		Model:    "preview-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-second-secret"}},
	}
	if err := op.ChannelCreate(secondChannel, ctx); err != nil {
		t.Fatalf("ChannelCreate second failed: %v", err)
	}

	group := &model.Group{Name: "preview-active-group", Mode: model.GroupModeFailover}
	if err := op.GroupCreate(group, ctx); err != nil {
		t.Fatalf("GroupCreate failed: %v", err)
	}
	if err := op.GroupItemAdd(&model.GroupItem{GroupID: group.ID, ChannelID: firstChannel.ID, ModelName: "preview-model", Priority: 1, Weight: 1}, ctx); err != nil {
		t.Fatalf("GroupItemAdd first failed: %v", err)
	}
	if err := op.GroupItemAdd(&model.GroupItem{GroupID: group.ID, ChannelID: secondChannel.ID, ModelName: "preview-model", Priority: 1, Weight: 1}, ctx); err != nil {
		t.Fatalf("GroupItemAdd second failed: %v", err)
	}

	iteratorGroup, err := op.GroupGet(group.ID, ctx)
	if err != nil {
		t.Fatalf("GroupGet failed: %v", err)
	}
	iter := balancer.NewIterator(*iteratorGroup, 0, "preview-model")
	if !iter.Next() {
		t.Fatal("expected first candidate")
	}
	span := iter.StartAttempt(firstChannel.ID, firstChannel.Keys[0].ID, firstChannel.Name)
	defer span.End(model.AttemptSuccess, 200, "")

	preview, err := BuildRoutingPreview(ctx, group.ID)
	if err != nil {
		t.Fatalf("BuildRoutingPreview failed: %v", err)
	}
	if len(preview.Candidates) != 2 {
		t.Fatalf("candidate count = %d, want 2", len(preview.Candidates))
	}
	if preview.Candidates[0].ChannelID != secondChannel.ID {
		t.Fatalf("expected idle candidate first, got %+v", preview.Candidates[0])
	}
	if preview.Candidates[1].ChannelID != firstChannel.ID || preview.Candidates[1].ActiveSelections != 1 {
		t.Fatalf("expected active selection count on first channel, got %+v", preview.Candidates[1])
	}
}

func TestBuildRoutingPreviewShowsProjectedAccountQuotaStatus(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)

	channel := &model.Channel{
		Name:     "routing-quota",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://quota.example.test/v1"}},
		Model:    "preview-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-quota-secret"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}
	group := &model.Group{Name: "preview-quota-group", Mode: model.GroupModeFailover}
	if err := op.GroupCreate(group, ctx); err != nil {
		t.Fatalf("GroupCreate failed: %v", err)
	}
	if err := op.GroupItemAdd(&model.GroupItem{GroupID: group.ID, ChannelID: channel.ID, ModelName: "preview-model", Priority: 1, Weight: 1}, ctx); err != nil {
		t.Fatalf("GroupItemAdd failed: %v", err)
	}
	siteID, accountID := createProbeSite(t)
	createProbeBinding(t, siteID, accountID, channel.ID, "preview-model", false)
	if err := dbpkg.GetDB().WithContext(ctx).
		Model(&model.SiteAccount{}).
		Where("id = ?", accountID).
		Updates(map[string]any{"balance": 12.5, "balance_used": 3.5}).Error; err != nil {
		t.Fatalf("update account balance failed: %v", err)
	}

	preview, err := BuildRoutingPreview(ctx, group.ID)
	if err != nil {
		t.Fatalf("BuildRoutingPreview failed: %v", err)
	}
	if len(preview.Candidates) != 1 {
		t.Fatalf("candidate count = %d, want 1", len(preview.Candidates))
	}
	candidate := preview.Candidates[0]
	if candidate.SiteID != siteID || candidate.SiteAccountID != accountID {
		t.Fatalf("expected projected site/account ids, got %+v", candidate)
	}
	if candidate.QuotaStatus != "available" {
		t.Fatalf("quota status = %q, want available: %+v", candidate.QuotaStatus, candidate)
	}
	if candidate.QuotaBalance != 12.5 || candidate.QuotaUsed != 3.5 {
		t.Fatalf("unexpected quota values: %+v", candidate)
	}
}

func TestBuildRoutingPreviewMarksRuntimeGuardedCandidates(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)

	channel := &model.Channel{
		Name:     "routing-disabled-model",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://disabled-model.example.test/v1"}},
		Model:    "preview-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-disabled-model"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}
	group := &model.Group{Name: "preview-disabled-model-group", Mode: model.GroupModeFailover}
	if err := op.GroupCreate(group, ctx); err != nil {
		t.Fatalf("GroupCreate failed: %v", err)
	}
	if err := op.GroupItemAdd(&model.GroupItem{GroupID: group.ID, ChannelID: channel.ID, ModelName: "preview-model", Priority: 1, Weight: 1}, ctx); err != nil {
		t.Fatalf("GroupItemAdd failed: %v", err)
	}
	siteID, accountID := createProbeSite(t)
	createProbeBinding(t, siteID, accountID, channel.ID, "preview-model", true)

	preview, err := BuildRoutingPreview(ctx, group.ID)
	if err != nil {
		t.Fatalf("BuildRoutingPreview failed: %v", err)
	}
	if len(preview.Candidates) != 1 {
		t.Fatalf("candidate count = %d, want 1", len(preview.Candidates))
	}
	candidate := preview.Candidates[0]
	if candidate.Decision != "site_model_disabled" {
		t.Fatalf("candidate decision = %q, want site_model_disabled: %+v", candidate.Decision, candidate)
	}
	if candidate.SiteID != siteID || candidate.SiteAccountID != accountID {
		t.Fatalf("expected projected metadata, got %+v", candidate)
	}
}

func TestBuildRoutingPreviewUsesNextReadyKeyWhenPreferredKeyCooling(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	balancer.Reset()
	t.Cleanup(balancer.Reset)

	if err := op.SettingSetString(model.SettingKeyHealthScoreEnabled, "true"); err != nil {
		t.Fatalf("SettingSetString failed: %v", err)
	}

	channel := &model.Channel{
		Name:     "routing-multi-key",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://multi-key.example.test/v1"}},
		Model:    "preview-model",
		Keys: []model.ChannelKey{
			{Enabled: true, ChannelKey: "sk-low-cost-secret", TotalCost: 1},
			{Enabled: true, ChannelKey: "sk-fallback-secret", TotalCost: 100},
		},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}
	storedChannel, err := op.ChannelGet(channel.ID, ctx)
	if err != nil {
		t.Fatalf("ChannelGet failed: %v", err)
	}
	if len(storedChannel.Keys) != 2 {
		t.Fatalf("key count = %d, want 2", len(storedChannel.Keys))
	}

	group := &model.Group{Name: "preview-multi-key-group", Mode: model.GroupModeFailover}
	if err := op.GroupCreate(group, ctx); err != nil {
		t.Fatalf("GroupCreate failed: %v", err)
	}
	if err := op.GroupItemAdd(&model.GroupItem{GroupID: group.ID, ChannelID: channel.ID, ModelName: "preview-model", Priority: 1, Weight: 1}, ctx); err != nil {
		t.Fatalf("GroupItemAdd failed: %v", err)
	}

	lowCostKey := storedChannel.GetChannelKey()
	balancer.RecordHealthAttempt(balancer.HealthAttempt{
		ChannelID:     channel.ID,
		ChannelKeyID:  lowCostKey.ID,
		ModelName:     "preview-model",
		Status:        model.AttemptFailed,
		HTTPStatus:    429,
		FailureReason: "rate_limit",
		RetryAfter:    10 * time.Second,
	})

	preview, err := BuildRoutingPreview(ctx, group.ID)
	if err != nil {
		t.Fatalf("BuildRoutingPreview failed: %v", err)
	}
	if len(preview.Candidates) != 1 {
		t.Fatalf("candidate count = %d, want 1", len(preview.Candidates))
	}
	candidate := preview.Candidates[0]
	if candidate.Decision != "ready" {
		t.Fatalf("candidate decision = %q, want ready: %+v", candidate.Decision, candidate)
	}
	if candidate.ChannelKeyID == lowCostKey.ID {
		t.Fatalf("expected preview to skip cooling key %d, got %+v", lowCostKey.ID, candidate)
	}
	if candidate.CoolingDown {
		t.Fatalf("fallback key should not be marked cooling down: %+v", candidate)
	}
}
