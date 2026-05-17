package grouphealth

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	dbpkg "github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

func TestSlowProbeSchedulerDisabledDoesNothing(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	var requests int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&requests, 1)
		writeValidChatProbeResponse(w)
	}))
	defer server.Close()

	createProbeGroupWithChannel(t, ctx, "disabled-probe-group", "disabled-probe-channel", server.URL)

	scheduler := NewSlowProbeScheduler(op.NewGroupHealthRepository(), &Prober{CandidateTimeout: time.Second})
	if err := scheduler.RunOnceWithConfig(ctx, ProbeConfig{Enabled: false}); err != nil {
		t.Fatalf("RunOnceWithConfig failed: %v", err)
	}
	if requests != 0 {
		t.Fatalf("expected no requests, got %d", requests)
	}
	if attempts := countGroupHealthAttempts(t); attempts != 0 {
		t.Fatalf("expected no attempts, got %d", attempts)
	}
}

func TestSlowProbeSchedulerCanUseStreamProbe(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	var sawStream bool
	var bodyErr atomic.Value
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			bodyErr.Store("unmarshal probe body failed: " + err.Error())
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		sawStream, _ = payload["stream"].(bool)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"id\":\"chatcmpl_1\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"delta\":{\"content\":\"OK\"}}],\"usage\":{\"completion_tokens\":1}}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	createProbeGroupWithChannel(t, ctx, "stream-probe-group", "stream-probe-channel", server.URL)

	scheduler := NewSlowProbeScheduler(op.NewGroupHealthRepository(), &Prober{CandidateTimeout: time.Second})
	if err := scheduler.RunOnceWithConfig(ctx, ProbeConfig{
		Enabled:                 true,
		SiteMinInterval:         time.Minute,
		ModelMinInterval:        time.Hour,
		MaxConcurrency:          1,
		DailyMaxRequestsPerSite: 20,
		Prompt:                  "只回复 OK",
		MaxTokens:               8,
		Stream:                  true,
	}); err != nil {
		t.Fatalf("RunOnceWithConfig failed: %v", err)
	}
	if value := bodyErr.Load(); value != nil {
		t.Fatal(value)
	}
	if !sawStream {
		t.Fatal("expected slow probe request to set stream=true")
	}
	if attempts := countGroupHealthAttempts(t); attempts != 1 {
		t.Fatalf("expected one attempt, got %d", attempts)
	}
}

func TestSlowProbeSchedulerRespectsSiteRateAndDailyBudget(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	var requests int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&requests, 1)
		writeValidChatProbeResponse(w)
	}))
	defer server.Close()

	firstChannel := createProbeGroupWithChannel(t, ctx, "site-budget-group-a", "site-budget-channel-a", server.URL)
	secondChannel := createProbeGroupWithChannel(t, ctx, "site-budget-group-b", "site-budget-channel-b", server.URL)
	siteID, accountID := createProbeSite(t)
	secondAccountID := createProbeAccount(t, siteID, "probe-account-2")
	createProbeBinding(t, siteID, accountID, firstChannel.ID, "probe-model", false)
	createProbeBinding(t, siteID, secondAccountID, secondChannel.ID, "probe-model", false)

	now := time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC)
	scheduler := NewSlowProbeScheduler(op.NewGroupHealthRepository(), &Prober{CandidateTimeout: time.Second})
	scheduler.now = func() time.Time { return now }
	cfg := ProbeConfig{
		Enabled:                 true,
		SiteMinInterval:         time.Hour,
		ModelMinInterval:        time.Hour,
		MaxConcurrency:          2,
		DailyMaxRequestsPerSite: 1,
		Prompt:                  "只回复 OK",
		MaxTokens:               8,
		JitterRatio:             0,
	}

	if err := scheduler.RunOnceWithConfig(ctx, cfg); err != nil {
		t.Fatalf("RunOnceWithConfig first failed: %v", err)
	}
	if requests != 1 {
		t.Fatalf("expected one request after first run, got %d", requests)
	}

	now = now.Add(2 * time.Hour)
	if err := scheduler.RunOnceWithConfig(ctx, cfg); err != nil {
		t.Fatalf("RunOnceWithConfig second failed: %v", err)
	}
	if requests != 1 {
		t.Fatalf("expected daily budget to block second request, got %d", requests)
	}
	if attempts := countGroupHealthAttempts(t); attempts != 1 {
		t.Fatalf("expected one attempt, got %d", attempts)
	}
}

func TestSlowProbeSchedulerSkipsDisabledSiteModel(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	var requests int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&requests, 1)
		writeValidChatProbeResponse(w)
	}))
	defer server.Close()

	channel := createProbeGroupWithChannel(t, ctx, "disabled-model-group", "disabled-model-channel", server.URL)
	siteID, accountID := createProbeSite(t)
	createProbeBinding(t, siteID, accountID, channel.ID, "probe-model", true)

	scheduler := NewSlowProbeScheduler(op.NewGroupHealthRepository(), &Prober{CandidateTimeout: time.Second})
	if err := scheduler.RunOnceWithConfig(ctx, ProbeConfig{
		Enabled:                 true,
		SiteMinInterval:         time.Minute,
		ModelMinInterval:        time.Hour,
		MaxConcurrency:          1,
		DailyMaxRequestsPerSite: 20,
		Prompt:                  "只回复 OK",
		MaxTokens:               8,
	}); err != nil {
		t.Fatalf("RunOnceWithConfig failed: %v", err)
	}
	if requests != 0 {
		t.Fatalf("expected disabled site model to skip probe, got %d requests", requests)
	}
	if attempts := countGroupHealthAttempts(t); attempts != 0 {
		t.Fatalf("expected no attempts, got %d", attempts)
	}
}

func TestSlowProbeSchedulerBacksOffAfterFailure(t *testing.T) {
	ctx := setupGroupHealthTestDB(t)
	var requests int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&requests, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"chatcmpl_1","object":"chat.completion","choices":[]}`))
	}))
	defer server.Close()

	channel := createProbeGroupWithChannel(t, ctx, "backoff-group", "backoff-channel", server.URL)
	now := time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC)
	scheduler := NewSlowProbeScheduler(op.NewGroupHealthRepository(), &Prober{CandidateTimeout: time.Second})
	scheduler.now = func() time.Time { return now }
	cfg := ProbeConfig{
		Enabled:                 true,
		SiteMinInterval:         time.Minute,
		MaxConcurrency:          1,
		DailyMaxRequestsPerSite: 20,
		Prompt:                  "只回复 OK",
		MaxTokens:               8,
		JitterRatio:             0,
	}

	if err := scheduler.RunOnceWithConfig(ctx, cfg); err != nil {
		t.Fatalf("RunOnceWithConfig first failed: %v", err)
	}
	if requests != 1 {
		t.Fatalf("expected one request, got %d", requests)
	}
	backoffKey := candidateProbeKey{ChannelID: channel.ID, ChannelKeyID: channel.Keys[0].ID, ModelName: "probe-model"}
	if backoff := scheduler.backoffs[backoffKey]; !backoff.Until.After(now) {
		t.Fatalf("expected failure backoff after %v, got %#v", now, backoff)
	}

	if err := scheduler.RunOnceWithConfig(ctx, cfg); err != nil {
		t.Fatalf("RunOnceWithConfig second failed: %v", err)
	}
	if requests != 1 {
		t.Fatalf("expected backoff to block second request, got %d", requests)
	}
}

func createProbeGroupWithChannel(t *testing.T, ctx context.Context, groupName string, channelName string, baseURL string) *model.Channel {
	t.Helper()

	channel := &model.Channel{
		Name:     channelName,
		Type:     outbound.OutboundTypeOpenAIChat,
		Enabled:  true,
		BaseUrls: []model.BaseUrl{{URL: baseURL + "/v1"}},
		Model:    "probe-model",
		Keys:     []model.ChannelKey{{Enabled: true, ChannelKey: "sk-test", Remark: "test"}},
	}
	if err := op.ChannelCreate(channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}
	group := &model.Group{Name: groupName, Mode: model.GroupModeFailover}
	if err := op.GroupCreate(group, ctx); err != nil {
		t.Fatalf("GroupCreate failed: %v", err)
	}
	if err := op.GroupItemAdd(&model.GroupItem{GroupID: group.ID, ChannelID: channel.ID, ModelName: "probe-model", Priority: 1, Weight: 1}, ctx); err != nil {
		t.Fatalf("GroupItemAdd failed: %v", err)
	}
	reloaded, err := op.ChannelGet(channel.ID, ctx)
	if err != nil {
		t.Fatalf("ChannelGet failed: %v", err)
	}
	return reloaded
}

func createProbeSite(t *testing.T) (int, int) {
	t.Helper()

	site := model.Site{
		Name:     "probe-site-" + filepath.Base(t.TempDir()),
		Platform: model.SitePlatformOpenAI,
		BaseURL:  "https://example.test",
		Enabled:  true,
	}
	if err := dbpkg.GetDB().Create(&site).Error; err != nil {
		t.Fatalf("create site failed: %v", err)
	}
	accountID := createProbeAccount(t, site.ID, "probe-account")
	return site.ID, accountID
}

func createProbeAccount(t *testing.T, siteID int, name string) int {
	t.Helper()

	account := model.SiteAccount{
		SiteID:         siteID,
		Name:           name,
		CredentialType: model.SiteCredentialTypeAPIKey,
		APIKey:         "sk-test",
		Enabled:        true,
		AutoSync:       true,
		AutoCheckin:    true,
	}
	if err := dbpkg.GetDB().Create(&account).Error; err != nil {
		t.Fatalf("create account failed: %v", err)
	}
	return account.ID
}

func createProbeBinding(t *testing.T, siteID int, accountID int, channelID int, modelName string, disabled bool) {
	t.Helper()

	binding := model.SiteChannelBinding{
		SiteID:        siteID,
		SiteAccountID: accountID,
		GroupKey:      model.SiteDefaultGroupKey,
		ChannelID:     channelID,
	}
	if err := dbpkg.GetDB().Create(&binding).Error; err != nil {
		t.Fatalf("create binding failed: %v", err)
	}
	siteModel := model.SiteModel{
		SiteAccountID: accountID,
		GroupKey:      model.SiteDefaultGroupKey,
		ModelName:     modelName,
		RouteType:     model.SiteModelRouteTypeOpenAIChat,
		RouteSource:   model.SiteModelRouteSourceSyncInferred,
		Disabled:      disabled,
	}
	if err := dbpkg.GetDB().
		Where("site_account_id = ? AND group_key = ? AND model_name = ?", accountID, model.SiteDefaultGroupKey, modelName).
		FirstOrCreate(&siteModel).Error; err != nil {
		t.Fatalf("create site model failed: %v", err)
	}
	if disabled {
		if err := dbpkg.GetDB().Model(&siteModel).Update("disabled", true).Error; err != nil {
			t.Fatalf("update site model disabled failed: %v", err)
		}
	}
}

func writeValidChatProbeResponse(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"id":"chatcmpl_1","object":"chat.completion","choices":[{"message":{"role":"assistant","content":"ok"}}],"usage":{"completion_tokens":1}}`))
}

func countGroupHealthAttempts(t *testing.T) int64 {
	t.Helper()
	var count int64
	if err := dbpkg.GetDB().Model(&model.GroupHealthAttempt{}).Count(&count).Error; err != nil {
		t.Fatalf("count attempts failed: %v", err)
	}
	return count
}
