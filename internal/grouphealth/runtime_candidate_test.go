package grouphealth

import (
	"strings"
	"testing"
	"time"

	dbpkg "github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

func TestEvaluateRuntimeCandidateAllowsUnmanagedAndUnsyncedZeroBalance(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)

	unmanaged := &model.Channel{
		Name:     "runtime-unmanaged",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://runtime-unmanaged.example.test/v1"}},
		Model:    "runtime-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-unmanaged"}},
	}
	if err := op.ChannelCreate(unmanaged, ctx); err != nil {
		t.Fatalf("ChannelCreate unmanaged failed: %v", err)
	}
	state, err := EvaluateRuntimeCandidate(ctx, *unmanaged, "runtime-model")
	if err != nil {
		t.Fatalf("EvaluateRuntimeCandidate unmanaged failed: %v", err)
	}
	if state.Managed || state.SkipReason != "" || state.QuotaStatus != "unknown" {
		t.Fatalf("unexpected unmanaged state: %+v", state)
	}

	managed := &model.Channel{
		Name:     "runtime-unsynced-zero",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: "https://runtime-zero.example.test/v1"}},
		Model:    "runtime-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-zero"}},
	}
	if err := op.ChannelCreate(managed, ctx); err != nil {
		t.Fatalf("ChannelCreate managed failed: %v", err)
	}
	siteID, accountID := createProbeSite(t)
	createProbeBinding(t, siteID, accountID, managed.ID, "runtime-model", false)

	state, err = EvaluateRuntimeCandidate(ctx, *managed, "runtime-model")
	if err != nil {
		t.Fatalf("EvaluateRuntimeCandidate managed failed: %v", err)
	}
	if !state.Managed || state.SkipReason != "" || state.QuotaStatus != "unknown" {
		t.Fatalf("unsynced zero-balance account should remain allowed as unknown, got %+v", state)
	}
}

func TestEvaluateRuntimeCandidateSkipsManagedRuntimeGuards(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)

	tests := []struct {
		name       string
		setup      func(t *testing.T, accountID int, modelName string)
		wantReason string
		wantQuota  string
	}{
		{
			name: "disabled account",
			setup: func(t *testing.T, accountID int, _ string) {
				t.Helper()
				if err := dbpkg.GetDB().WithContext(ctx).Model(&model.SiteAccount{}).Where("id = ?", accountID).Update("enabled", false).Error; err != nil {
					t.Fatalf("disable account failed: %v", err)
				}
			},
			wantReason: "site_account_disabled",
			wantQuota:  "account_disabled",
		},
		{
			name: "known zero balance",
			setup: func(t *testing.T, accountID int, _ string) {
				t.Helper()
				now := time.Now()
				if err := dbpkg.GetDB().WithContext(ctx).Model(&model.SiteAccount{}).Where("id = ?", accountID).Updates(map[string]any{
					"balance":      0,
					"balance_used": 1.25,
					"last_sync_at": now,
				}).Error; err != nil {
					t.Fatalf("mark zero balance failed: %v", err)
				}
			},
			wantReason: "site_account_zero_balance",
			wantQuota:  "zero_balance",
		},
		{
			name: "disabled site model",
			setup: func(t *testing.T, accountID int, modelName string) {
				t.Helper()
				if err := op.SiteModelDisabledUpdate(accountID, model.SiteDefaultGroupKey, modelName, true, ctx); err != nil {
					t.Fatalf("disable site model failed: %v", err)
				}
			},
			wantReason: "site_model_disabled",
			wantQuota:  "model_disabled",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			channel := &model.Channel{
				Name:     "runtime-" + tt.name,
				Type:     outbound.OutboundTypeOpenAIChat,
				Enabled:  true,
				BaseUrls: []model.BaseUrl{{URL: "https://runtime-guard.example.test/v1"}},
				Model:    "runtime-model",
				Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-runtime"}},
			}
			if err := op.ChannelCreate(channel, ctx); err != nil {
				t.Fatalf("ChannelCreate failed: %v", err)
			}
			site := model.Site{
				Name:     "runtime-site-" + strings.ReplaceAll(tt.name, " ", "-"),
				Platform: model.SitePlatformOpenAI,
				BaseURL:  "https://runtime-guard.example.test",
				Enabled:  true,
			}
			if err := dbpkg.GetDB().WithContext(ctx).Create(&site).Error; err != nil {
				t.Fatalf("create site failed: %v", err)
			}
			accountID := createProbeAccount(t, site.ID, "runtime-account-"+strings.ReplaceAll(tt.name, " ", "-"))
			createProbeBinding(t, site.ID, accountID, channel.ID, "runtime-model", false)
			tt.setup(t, accountID, "runtime-model")

			state, err := EvaluateRuntimeCandidate(ctx, *channel, "runtime-model")
			if err != nil {
				t.Fatalf("EvaluateRuntimeCandidate failed: %v", err)
			}
			if state.SkipReason != tt.wantReason || state.QuotaStatus != tt.wantQuota {
				t.Fatalf("unexpected runtime state: got %+v, want reason=%s quota=%s", state, tt.wantReason, tt.wantQuota)
			}
			if state.QuotaReason == "" {
				t.Fatalf("expected quota reason for guarded runtime state: %+v", state)
			}
			if state.CapacityStatus != "blocked" || state.CapacityReason == "" || state.CapacityScope == "" || state.CapacitySource == "" {
				t.Fatalf("expected structured capacity block for guarded runtime state: %+v", state)
			}
		})
	}
}
