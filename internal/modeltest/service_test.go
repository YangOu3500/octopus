package modeltest

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
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
	for _, item := range result.Results {
		if item.LogID == 0 || item.TraceID == "" {
			t.Fatalf("expected log metadata on model test result: %+v", item)
		}
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

func TestRunModelTestSkipsKnownZeroBalanceManagedChannel(t *testing.T) {
	ctx := setupModelTestDB(t)

	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "zero-balance model test should not call upstream", http.StatusInternalServerError)
	}))
	defer server.Close()

	channel := &model.Channel{
		Name:     "model-test-zero-balance",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: server.URL + "/v1"}},
		Model:    "test-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-channel-secret", Remark: "zero"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}
	site := &model.Site{
		Name:         "model-test-zero-site",
		Platform:     model.SitePlatformOpenAI,
		BaseURL:      server.URL,
		Enabled:      true,
		GlobalWeight: 1,
	}
	if err := op.SiteCreate(site, ctx); err != nil {
		t.Fatalf("SiteCreate failed: %v", err)
	}
	now := time.Now()
	account := &model.SiteAccount{
		SiteID:         site.ID,
		Name:           "model-test-zero-account",
		CredentialType: model.SiteCredentialTypeAPIKey,
		APIKey:         "fake-site-key",
		Enabled:        true,
		Balance:        0,
		BalanceUsed:    1,
		LastSyncAt:     &now,
	}
	if err := op.SiteAccountCreate(account, ctx); err != nil {
		t.Fatalf("SiteAccountCreate failed: %v", err)
	}
	if err := dbpkg.GetDB().WithContext(ctx).Create(&model.SiteChannelBinding{
		SiteID:        site.ID,
		SiteAccountID: account.ID,
		GroupKey:      model.SiteDefaultGroupKey,
		ChannelID:     channel.ID,
	}).Error; err != nil {
		t.Fatalf("create binding failed: %v", err)
	}
	if err := dbpkg.GetDB().WithContext(ctx).Create(&model.SiteModel{
		SiteAccountID: account.ID,
		GroupKey:      model.SiteDefaultGroupKey,
		ModelName:     "test-model",
		RouteType:     model.SiteModelRouteTypeOpenAIChat,
		RouteSource:   model.SiteModelRouteSourceSyncInferred,
	}).Error; err != nil {
		t.Fatalf("create site model failed: %v", err)
	}

	result, err := NewService(nil).Run(ctx, RunRequest{
		Mode:        "channel",
		Concurrency: 1,
		Targets:     []RunTarget{{ChannelID: channel.ID, ModelName: "test-model"}},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if hits.Load() != 0 {
		t.Fatalf("expected zero-balance channel to be skipped before upstream call, got %d hits", hits.Load())
	}
	if result.Total != 1 || result.Success != 0 || result.Failed != 1 {
		t.Fatalf("unexpected result summary: %+v", result)
	}
	if result.Results[0].FailureReason != "site_account_zero_balance" {
		t.Fatalf("unexpected failure reason: %+v", result.Results[0])
	}
}

func TestRunModelTestStreamRecordsTTFBUsageAndLog(t *testing.T) {
	ctx := setupModelTestDB(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		_, _ = w.Write([]byte(`data: {"id":"chunk-1","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"}}]}` + "\n\n"))
		if flusher != nil {
			flusher.Flush()
		}
		time.Sleep(20 * time.Millisecond)
		_, _ = w.Write([]byte(`data: {"id":"chunk-2","object":"chat.completion.chunk","choices":[{"delta":{"content":"OK"}}]}` + "\n\n"))
		_, _ = w.Write([]byte(`data: {"id":"chunk-3","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":4,"completion_tokens":1}}` + "\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	channel := &model.Channel{
		Name:     "model-test-stream",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: server.URL + "/v1"}},
		Model:    "test-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "test-stream-secret", Remark: "stream"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}

	service := NewService(nil)
	service.prober.CandidateTimeout = 5 * time.Second
	result, err := service.Run(ctx, RunRequest{
		Mode:        "channel",
		Concurrency: 1,
		Stream:      true,
		Targets:     []RunTarget{{ChannelID: channel.ID, ModelName: "test-model"}},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if result.Total != 1 || result.Success != 1 || result.Failed != 0 {
		t.Fatalf("unexpected summary: %+v", result)
	}
	item := result.Results[0]
	if !item.Success || item.ResponseText != "OK" {
		t.Fatalf("expected stream OK result: %+v", item)
	}
	if item.TTFBMS <= 0 {
		t.Fatalf("expected positive stream ttfb: %+v", item)
	}
	if item.InputTokens != 4 || item.OutputTokens != 1 {
		t.Fatalf("unexpected stream usage: %+v", item)
	}
	if item.LogID == 0 || item.TraceID == "" {
		t.Fatalf("expected stream result log metadata: %+v", item)
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
	if len(logs.Items) != 1 {
		t.Fatalf("expected 1 model_test log, got %d", len(logs.Items))
	}
	log := logs.Items[0]
	if !log.RequestStream {
		t.Fatalf("expected model test stream log: %+v", log)
	}
	if log.Ftut <= 0 {
		t.Fatalf("expected ttfb in log: %+v", log)
	}
	if log.ID != item.LogID || log.TraceID != item.TraceID {
		t.Fatalf("expected result to point to saved log: result=%+v log=%+v", item, log)
	}
	if strings.Contains(log.RequestContent, "test-stream-secret") || strings.Contains(log.ResponseContent, "test-stream-secret") {
		t.Fatalf("model test log leaked key: request=%s response=%s", log.RequestContent, log.ResponseContent)
	}
}

func TestRunModelTestStreamEmptyDoneFails(t *testing.T) {
	ctx := setupModelTestDB(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	channel := &model.Channel{
		Name:     "model-test-stream-empty",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: server.URL + "/v1"}},
		Model:    "test-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "test-empty-secret", Remark: "empty"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}

	result, err := NewService(nil).Run(ctx, RunRequest{
		Mode:        "channel",
		Concurrency: 1,
		Stream:      true,
		Targets:     []RunTarget{{ChannelID: channel.ID, ModelName: "test-model"}},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if result.Success != 0 || result.Failed != 1 {
		t.Fatalf("expected stream empty failure: %+v", result)
	}
	item := result.Results[0]
	if item.Success || item.HTTPStatus != http.StatusOK || item.FailureReason != "stream_empty_response" {
		t.Fatalf("unexpected empty stream result: %+v", item)
	}
}

func TestRunModelTestConcurrencyOneRunsTargetsInOrder(t *testing.T) {
	ctx := setupModelTestDB(t)

	var mu sync.Mutex
	active := 0
	maxActive := 0
	var order []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		modelName, _ := payload["model"].(string)

		mu.Lock()
		active++
		if active > maxActive {
			maxActive = active
		}
		order = append(order, modelName)
		mu.Unlock()

		time.Sleep(20 * time.Millisecond)

		mu.Lock()
		active--
		mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"ok","object":"chat.completion","choices":[{"message":{"role":"assistant","content":"OK"}}],"usage":{"prompt_tokens":5,"completion_tokens":1}}`))
	}))
	defer server.Close()

	channel := &model.Channel{
		Name:     "model-test-concurrency",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: server.URL + "/v1"}},
		Model:    "model-a,model-b,model-c,model-d",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-concurrency-secret", Remark: "concurrency"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}

	result, err := NewService(nil).Run(ctx, RunRequest{
		Mode:        "channel",
		Concurrency: 1,
		Targets: []RunTarget{
			{ChannelID: channel.ID, ModelName: "model-a"},
			{ChannelID: channel.ID, ModelName: "model-b"},
			{ChannelID: channel.ID, ModelName: "model-c"},
			{ChannelID: channel.ID, ModelName: "model-d"},
		},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if result.Success != 4 || result.Failed != 0 {
		t.Fatalf("unexpected summary: %+v", result)
	}
	for i, item := range result.Results {
		if item.Index != i+1 || item.LogID == 0 || item.TraceID == "" {
			t.Fatalf("unexpected result metadata at %d: %+v", i, item)
		}
	}

	mu.Lock()
	gotMaxActive := maxActive
	gotOrder := append([]string(nil), order...)
	mu.Unlock()

	if gotMaxActive != 1 {
		t.Fatalf("expected at most one active request, got %d", gotMaxActive)
	}
	wantOrder := []string{"model-a", "model-b", "model-c", "model-d"}
	if strings.Join(gotOrder, ",") != strings.Join(wantOrder, ",") {
		t.Fatalf("request order = %v, want %v", gotOrder, wantOrder)
	}
}

func TestRunModelTestUnexpectedSSEErrorIsSummarized(t *testing.T) {
	ctx := setupModelTestDB(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(`data: {"error":{"message":"Chat upstream returned 403 (request id: test)","type":"upstream_error"}}` + "\n\n"))
	}))
	defer server.Close()

	channel := &model.Channel{
		Name:     "model-test-sse-error",
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: server.URL + "/v1"}},
		Model:    "test-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "test-sse-secret", Remark: "sse-error"}},
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
	item := result.Results[0]
	if item.Success || item.HTTPStatus != http.StatusForbidden || item.FailureReason != "auth_error" {
		t.Fatalf("unexpected SSE error result: %+v", item)
	}
	if strings.Contains(item.ResponseText, "data:") {
		t.Fatalf("raw SSE leaked into response text: %q", item.ResponseText)
	}
	if !strings.Contains(item.ErrorMessage, "upstream returned 403") {
		t.Fatalf("expected summarized upstream error, got %q", item.ErrorMessage)
	}
}
