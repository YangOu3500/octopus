package grouphealth

import (
	"testing"
	"time"

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
