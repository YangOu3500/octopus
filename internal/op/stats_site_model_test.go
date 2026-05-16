package op

import (
	"testing"

	dbpkg "github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
)

func TestStatsSiteModelHourlyRecordAttemptsIncludesTokenCost(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	resetSiteModelHourlyCacheForTest(t)

	site := model.Site{Name: "stats-site", Platform: model.SitePlatformOpenAI, BaseURL: "https://example.test", Enabled: true}
	if err := dbpkg.GetDB().Create(&site).Error; err != nil {
		t.Fatalf("create site failed: %v", err)
	}
	account := model.SiteAccount{SiteID: site.ID, Name: "stats-account", CredentialType: model.SiteCredentialTypeAPIKey, APIKey: "sk-test", Enabled: true}
	if err := dbpkg.GetDB().Create(&account).Error; err != nil {
		t.Fatalf("create account failed: %v", err)
	}
	binding := model.SiteChannelBinding{SiteID: site.ID, SiteAccountID: account.ID, GroupKey: model.SiteDefaultGroupKey, ChannelID: 123}
	if err := dbpkg.GetDB().Create(&binding).Error; err != nil {
		t.Fatalf("create binding failed: %v", err)
	}
	invalidateSiteBindingCache()

	StatsSiteModelHourlyRecordAttempts([]model.ChannelAttempt{
		{
			ChannelID:     123,
			ModelName:     "gpt-4o-mini",
			Status:        model.AttemptFailed,
			InputTokens:   321,
			OutputTokens:  0,
			InputCost:     0.000123,
			EstimatedCost: 0.000123,
		},
		{
			ChannelID:     123,
			ModelName:     "gpt-4o-mini",
			Status:        model.AttemptSuccess,
			InputTokens:   100,
			OutputTokens:  50,
			InputCost:     0.000010,
			OutputCost:    0.000020,
			EstimatedCost: 0.000030,
		},
	}, "fallback")
	if err := StatsSiteModelHourlySaveDB(ctx); err != nil {
		t.Fatalf("StatsSiteModelHourlySaveDB failed: %v", err)
	}

	var row model.StatsSiteModelHourly
	if err := dbpkg.GetDB().
		Where("site_account_id = ? AND group_key = ? AND model_name = ?", account.ID, model.SiteDefaultGroupKey, "gpt-4o-mini").
		First(&row).Error; err != nil {
		t.Fatalf("load hourly row failed: %v", err)
	}
	if row.RequestFailed != 1 || row.RequestSuccess != 1 {
		t.Fatalf("expected success/failure counts 1/1, got success=%d failure=%d", row.RequestSuccess, row.RequestFailed)
	}
	if row.InputToken != 421 || row.OutputToken != 50 {
		t.Fatalf("expected token totals 421/50, got %d/%d", row.InputToken, row.OutputToken)
	}
	if row.InputCost <= 0.000132 || row.OutputCost != 0.000020 {
		t.Fatalf("expected cost totals to include failed and success attempts, got input=%f output=%f", row.InputCost, row.OutputCost)
	}
}

func resetSiteModelHourlyCacheForTest(t *testing.T) {
	t.Helper()
	siteModelHourlyCacheLock.Lock()
	siteModelHourlyCache = make(map[siteModelHourlyKey]*model.StatsSiteModelHourly)
	siteModelHourlyCacheLock.Unlock()
	t.Cleanup(func() {
		siteModelHourlyCacheLock.Lock()
		siteModelHourlyCache = make(map[siteModelHourlyKey]*model.StatsSiteModelHourly)
		siteModelHourlyCacheLock.Unlock()
		invalidateSiteBindingCache()
	})
}
