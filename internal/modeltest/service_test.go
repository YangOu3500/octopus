package modeltest

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	dbpkg "github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/relay/balancer"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

func setupModelTestDB(t *testing.T) context.Context {
	t.Helper()

	if dbpkg.GetDB() != nil {
		_ = dbpkg.Close()
	}

	dbPath := filepath.Join(t.TempDir(), "octopus-model-test.db")
	if err := dbpkg.InitDB("sqlite", dbPath, false); err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	if err := op.InitCache(); err != nil {
		t.Fatalf("InitCache failed: %v", err)
	}
	if err := op.RelayLogClear(context.Background()); err != nil {
		t.Fatalf("RelayLogClear failed: %v", err)
	}
	t.Cleanup(func() {
		_ = dbpkg.Close()
	})

	return context.Background()
}

func TestRunModelTestRecordsResultsLogsAndHealth(t *testing.T) {
	ctx := setupModelTestDB(t)
	if err := op.SettingSetString(model.SettingKeyHealthScoreEnabled, "true"); err != nil {
		t.Fatalf("SettingSetString failed: %v", err)
	}

	firstServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"bad","object":"chat.completion","choices":[],"usage":{"prompt_tokens":4,"completion_tokens":0}}`))
	}))
	defer firstServer.Close()

	secondServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"ok","object":"chat.completion","model":"test-model","choices":[{"message":{"role":"assistant","content":"OK"}}],"usage":{"prompt_tokens":5,"completion_tokens":1}}`))
	}))
	defer secondServer.Close()

	firstChannel := &model.Channel{
		Name:     "model-test-first",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: firstServer.URL + "/v1"}},
		Model:    "test-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-first-secret", Remark: "first"}},
	}
	if err := op.ChannelCreate(firstChannel, ctx); err != nil {
		t.Fatalf("ChannelCreate first failed: %v", err)
	}

	secondChannel := &model.Channel{
		Name:     "model-test-second",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: secondServer.URL + "/v1"}},
		Model:    "test-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-second-secret", Remark: "second"}},
	}
	if err := op.ChannelCreate(secondChannel, ctx); err != nil {
		t.Fatalf("ChannelCreate second failed: %v", err)
	}

	service := NewService(nil)
	service.prober.CandidateTimeout = 5 * time.Second
	result, err := service.Run(ctx, RunRequest{
		Mode:        "channel",
		Prompt:      "只回复 OK",
		MaxTokens:   8,
		Concurrency: 2,
		Targets: []RunTarget{
			{ChannelID: firstChannel.ID, ModelName: "test-model"},
			{ChannelID: secondChannel.ID, ModelName: "test-model"},
		},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if result.Total != 2 || result.Success != 1 || result.Failed != 1 {
		t.Fatalf("unexpected summary: %+v", result)
	}
	if result.Results[0].Success {
		t.Fatalf("expected first target failed: %+v", result.Results[0])
	}
	if result.Results[0].HTTPStatus != http.StatusOK || result.Results[0].FailureReason != "empty_choices" {
		t.Fatalf("unexpected first failure: %+v", result.Results[0])
	}
	if !result.Results[1].Success || result.Results[1].ResponseText != "OK" {
		t.Fatalf("expected second target OK: %+v", result.Results[1])
	}

	logs, err := op.RelayLogListWithQuery(ctx, model.RelayLogListQuery{
		Source:      "model_test",
		Page:        1,
		PageSize:    10,
		IncludeBody: true,
	})
	if err != nil {
		t.Fatalf("RelayLogListWithQuery failed: %v", err)
	}
	if len(logs.Items) != 2 {
		t.Fatalf("expected 2 model_test logs, got %d", len(logs.Items))
	}
	for _, item := range logs.Items {
		if item.RequestSource != "model_test" {
			t.Fatalf("unexpected source: %+v", item)
		}
		if len(item.Attempts) != 1 {
			t.Fatalf("expected one attempt per model test log: %+v", item)
		}
		if strings.Contains(item.RequestContent, "sk-first-secret") || strings.Contains(item.RequestContent, "sk-second-secret") {
			t.Fatalf("request content leaked key: %s", item.RequestContent)
		}
	}

	if score := balancer.HealthScore(firstChannel.ID, "test-model"); score >= 100 {
		t.Fatalf("expected failed target to reduce health score, got %.2f", score)
	}
}

func TestRunModelTestRedactsSensitiveResponseText(t *testing.T) {
	ctx := setupModelTestDB(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"ok","object":"chat.completion","choices":[{"message":{"role":"assistant","content":"Authorization: Bearer abc.def.ghi sk-secret123456789"}}],"usage":{"prompt_tokens":5,"completion_tokens":3}}`))
	}))
	defer server.Close()

	channel := &model.Channel{
		Name:     "model-test-redact",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: server.URL + "/v1"}},
		Model:    "test-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-channel-secret", Remark: "redact"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}

	result, err := NewService(nil).Run(ctx, RunRequest{
		Mode:        "channel",
		Concurrency: 1,
		Targets:     []RunTarget{{ChannelID: channel.ID, ModelName: "test-model"}},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if len(result.Results) != 1 || !result.Results[0].Success {
		t.Fatalf("expected success result: %+v", result)
	}
	text := result.Results[0].ResponseText
	if strings.Contains(text, "abc.def.ghi") || strings.Contains(text, "sk-secret123456789") {
		t.Fatalf("response text leaked secret: %s", text)
	}
	if !strings.Contains(text, "[REDACTED]") {
		t.Fatalf("response text was not redacted as expected: %s", text)
	}
}
