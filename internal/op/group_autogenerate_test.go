package op

import (
	"testing"

	dbpkg "github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
)

func TestGroupAutoGenerateCreatesGroupsByModelName(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	first := model.Channel{
		Name:      "first",
		Type:      outbound.OutboundTypeOpenAIChat,
		Enabled:   true,
		Model:     "gpt-4o,gpt-3.5",
		BaseUrls:  []model.BaseUrl{{URL: "https://first.test", Delay: 0}},
		Keys:      []model.ChannelKey{{Enabled: true, ChannelKey: "sk-first"}},
		AutoGroup: model.AutoGroupTypeNone,
	}
	if err := ChannelCreate(&first, ctx); err != nil {
		t.Fatalf("ChannelCreate first failed: %v", err)
	}
	second := model.Channel{
		Name:        "second",
		Type:        outbound.OutboundTypeOpenAIChat,
		Enabled:     true,
		CustomModel: "gpt-4o",
		BaseUrls:    []model.BaseUrl{{URL: "https://second.test", Delay: 0}},
		Keys:        []model.ChannelKey{{Enabled: true, ChannelKey: "sk-second"}},
		AutoGroup:   model.AutoGroupTypeNone,
	}
	if err := ChannelCreate(&second, ctx); err != nil {
		t.Fatalf("ChannelCreate second failed: %v", err)
	}
	disabled := model.Channel{
		Name:      "disabled",
		Type:      outbound.OutboundTypeOpenAIChat,
		Enabled:   false,
		Model:     "gpt-4o",
		BaseUrls:  []model.BaseUrl{{URL: "https://disabled.test", Delay: 0}},
		Keys:      []model.ChannelKey{{Enabled: true, ChannelKey: "sk-disabled"}},
		AutoGroup: model.AutoGroupTypeNone,
	}
	if err := ChannelCreate(&disabled, ctx); err != nil {
		t.Fatalf("ChannelCreate disabled failed: %v", err)
	}
	if err := dbpkg.GetDB().WithContext(ctx).Model(&model.Channel{}).Where("id = ?", disabled.ID).Update("enabled", false).Error; err != nil {
		t.Fatalf("disable channel failed: %v", err)
	}

	result, err := GroupAutoGenerate(&model.GroupAutoGenerateRequest{All: true}, ctx)
	if err != nil {
		t.Fatalf("GroupAutoGenerate failed: %v", err)
	}
	if result.CreatedGroups != 2 {
		t.Fatalf("created groups = %d, want 2; result=%+v", result.CreatedGroups, result)
	}
	if result.AddedItems != 3 {
		t.Fatalf("added items = %d, want 3; result=%+v", result.AddedItems, result)
	}

	gpt4o := getGroupByNameForTest(t, "gpt-4o")
	if len(gpt4o.Items) != 2 {
		t.Fatalf("gpt-4o item count = %d, want 2: %+v", len(gpt4o.Items), gpt4o.Items)
	}
	for _, item := range gpt4o.Items {
		if item.ChannelID == disabled.ID {
			t.Fatalf("disabled channel was added: %+v", item)
		}
		if item.ModelName != "gpt-4o" {
			t.Fatalf("unexpected model name: %+v", item)
		}
	}

	gpt35 := getGroupByNameForTest(t, "gpt-3.5")
	if len(gpt35.Items) != 1 || gpt35.Items[0].ChannelID != first.ID {
		t.Fatalf("unexpected gpt-3.5 items: %+v", gpt35.Items)
	}
}

func TestGroupAutoGenerateFillsExistingGroupWithoutDuplicate(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	first := model.Channel{Name: "first", Type: outbound.OutboundTypeOpenAIChat, Enabled: true, Model: "gpt-4o", BaseUrls: []model.BaseUrl{{URL: "https://first.test"}}, Keys: []model.ChannelKey{{Enabled: true, ChannelKey: "sk-first"}}}
	if err := ChannelCreate(&first, ctx); err != nil {
		t.Fatalf("ChannelCreate first failed: %v", err)
	}
	second := model.Channel{Name: "second", Type: outbound.OutboundTypeOpenAIChat, Enabled: true, Model: "gpt-4o", BaseUrls: []model.BaseUrl{{URL: "https://second.test"}}, Keys: []model.ChannelKey{{Enabled: true, ChannelKey: "sk-second"}}}
	if err := ChannelCreate(&second, ctx); err != nil {
		t.Fatalf("ChannelCreate second failed: %v", err)
	}
	existing := model.Group{
		Name: "gpt-4o",
		Mode: model.GroupModeFailover,
		Items: []model.GroupItem{{
			ChannelID: first.ID,
			ModelName: "gpt-4o",
			Priority:  1,
			Weight:    1,
		}},
	}
	if err := GroupCreate(&existing, ctx); err != nil {
		t.Fatalf("GroupCreate failed: %v", err)
	}

	result, err := GroupAutoGenerate(&model.GroupAutoGenerateRequest{ModelNames: []string{"gpt-4o"}}, ctx)
	if err != nil {
		t.Fatalf("GroupAutoGenerate failed: %v", err)
	}
	if result.CreatedGroups != 0 || result.UpdatedGroups != 1 || result.AddedItems != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}

	gpt4o := getGroupByNameForTest(t, "gpt-4o")
	if gpt4o.ID != existing.ID {
		t.Fatalf("expected existing group id %d, got %d", existing.ID, gpt4o.ID)
	}
	if len(gpt4o.Items) != 2 {
		t.Fatalf("expected 2 items after fill, got %+v", gpt4o.Items)
	}

	result, err = GroupAutoGenerate(&model.GroupAutoGenerateRequest{ModelNames: []string{"gpt-4o"}}, ctx)
	if err != nil {
		t.Fatalf("second GroupAutoGenerate failed: %v", err)
	}
	if result.AddedItems != 0 || result.SkippedGroups != 1 {
		t.Fatalf("expected second run to be already complete, got %+v", result)
	}
}

func TestGroupAutoGenerateSelectedModelsOnly(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	channel := model.Channel{
		Name:      "mixed",
		Type:      outbound.OutboundTypeOpenAIChat,
		Enabled:   true,
		Model:     "gpt-4o,gpt-3.5,claude-3",
		BaseUrls:  []model.BaseUrl{{URL: "https://mixed.test"}},
		Keys:      []model.ChannelKey{{Enabled: true, ChannelKey: "sk-mixed"}},
		AutoGroup: model.AutoGroupTypeNone,
	}
	if err := ChannelCreate(&channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}

	preview, err := GroupAutoGeneratePreview(&model.GroupAutoGenerateRequest{ModelNames: []string{"gpt-4o"}}, ctx)
	if err != nil {
		t.Fatalf("GroupAutoGeneratePreview failed: %v", err)
	}
	if preview.TotalModels != 3 || preview.SelectedModels != 1 || len(preview.Items) != 1 || preview.Items[0].ModelName != "gpt-4o" {
		t.Fatalf("unexpected preview: %+v", preview)
	}

	result, err := GroupAutoGenerate(&model.GroupAutoGenerateRequest{ModelNames: []string{"gpt-4o"}}, ctx)
	if err != nil {
		t.Fatalf("GroupAutoGenerate failed: %v", err)
	}
	if result.CreatedGroups != 1 || result.SelectedModels != 1 {
		t.Fatalf("expected only selected model to be generated, got %+v", result)
	}

	_ = getGroupByNameForTest(t, "gpt-4o")
	for _, name := range []string{"gpt-3.5", "claude-3"} {
		var count int64
		if err := dbpkg.GetDB().WithContext(ctx).Model(&model.Group{}).Where("name = ?", name).Count(&count).Error; err != nil {
			t.Fatalf("count group %q failed: %v", name, err)
		}
		if count != 0 {
			t.Fatalf("group %q should not be generated", name)
		}
	}
}

func TestGroupAutoGenerateSkipsDisabledProjectedModels(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	site := model.Site{Name: "site", Platform: model.SitePlatformNewAPI, BaseURL: "https://site.test", Enabled: true}
	if err := SiteCreate(&site, ctx); err != nil {
		t.Fatalf("SiteCreate failed: %v", err)
	}
	account := model.SiteAccount{SiteID: site.ID, Name: "account", CredentialType: model.SiteCredentialTypeAPIKey, APIKey: "sk-account", Enabled: true}
	if err := SiteAccountCreate(&account, ctx); err != nil {
		t.Fatalf("SiteAccountCreate failed: %v", err)
	}
	channel := model.Channel{
		Name:      "projected",
		Type:      outbound.OutboundTypeOpenAIChat,
		Enabled:   true,
		Model:     "good-model,disabled-model",
		BaseUrls:  []model.BaseUrl{{URL: "https://projected.test"}},
		Keys:      []model.ChannelKey{{Enabled: true, ChannelKey: "sk-projected"}},
		AutoGroup: model.AutoGroupTypeNone,
	}
	if err := ChannelCreate(&channel, ctx); err != nil {
		t.Fatalf("ChannelCreate failed: %v", err)
	}
	if err := dbpkg.GetDB().WithContext(ctx).Create(&model.SiteChannelBinding{SiteID: site.ID, SiteAccountID: account.ID, GroupKey: model.SiteDefaultGroupKey, ChannelID: channel.ID}).Error; err != nil {
		t.Fatalf("create binding failed: %v", err)
	}
	rows := []model.SiteModel{
		{SiteAccountID: account.ID, GroupKey: model.SiteDefaultGroupKey, ModelName: "good-model", RouteType: model.SiteModelRouteTypeOpenAIChat, Disabled: false},
		{SiteAccountID: account.ID, GroupKey: model.SiteDefaultGroupKey, ModelName: "disabled-model", RouteType: model.SiteModelRouteTypeOpenAIChat, Disabled: true},
	}
	if err := dbpkg.GetDB().WithContext(ctx).Create(&rows).Error; err != nil {
		t.Fatalf("create site models failed: %v", err)
	}

	result, err := GroupAutoGenerate(&model.GroupAutoGenerateRequest{All: true}, ctx)
	if err != nil {
		t.Fatalf("GroupAutoGenerate failed: %v", err)
	}
	if result.CreatedGroups != 1 || result.AddedItems != 1 {
		t.Fatalf("expected only active projected model to be generated, got %+v", result)
	}

	good := getGroupByNameForTest(t, "good-model")
	if len(good.Items) != 1 || good.Items[0].ChannelID != channel.ID {
		t.Fatalf("unexpected good-model group items: %+v", good.Items)
	}
	var disabledCount int64
	if err := dbpkg.GetDB().WithContext(ctx).Model(&model.Group{}).Where("name = ?", "disabled-model").Count(&disabledCount).Error; err != nil {
		t.Fatalf("count disabled group failed: %v", err)
	}
	if disabledCount != 0 {
		t.Fatalf("disabled projected model group should not be created")
	}
}

func TestGroupAutoGenerateAliasAssociationFoldsProviderModelNames(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	first := model.Channel{
		Name:      "prefixed",
		Type:      outbound.OutboundTypeOpenAIChat,
		Enabled:   true,
		Model:     "openai/gpt-4o,models/gemini-1.5-pro",
		BaseUrls:  []model.BaseUrl{{URL: "https://prefixed.test"}},
		Keys:      []model.ChannelKey{{Enabled: true, ChannelKey: "sk-prefixed"}},
		AutoGroup: model.AutoGroupTypeNone,
	}
	if err := ChannelCreate(&first, ctx); err != nil {
		t.Fatalf("ChannelCreate first failed: %v", err)
	}
	second := model.Channel{
		Name:      "plain",
		Type:      outbound.OutboundTypeOpenAIChat,
		Enabled:   true,
		Model:     "gpt-4o",
		BaseUrls:  []model.BaseUrl{{URL: "https://plain.test"}},
		Keys:      []model.ChannelKey{{Enabled: true, ChannelKey: "sk-plain"}},
		AutoGroup: model.AutoGroupTypeNone,
	}
	if err := ChannelCreate(&second, ctx); err != nil {
		t.Fatalf("ChannelCreate second failed: %v", err)
	}

	preview, err := GroupAutoGeneratePreview(&model.GroupAutoGenerateRequest{
		All:             true,
		AssociationMode: model.GroupAutoGenerateAssociationAlias,
	}, ctx)
	if err != nil {
		t.Fatalf("GroupAutoGeneratePreview failed: %v", err)
	}
	if preview.AssociationMode != model.GroupAutoGenerateAssociationAlias {
		t.Fatalf("association mode = %q, want alias", preview.AssociationMode)
	}
	if preview.TotalModels != 2 {
		t.Fatalf("preview total models = %d, want 2: %+v", preview.TotalModels, preview)
	}
	var gpt4oPreview *model.GroupAutoGeneratePreviewItem
	for i := range preview.Items {
		if preview.Items[i].ModelName == "gpt-4o" {
			gpt4oPreview = &preview.Items[i]
		}
	}
	if gpt4oPreview == nil {
		t.Fatalf("gpt-4o alias bucket missing: %+v", preview.Items)
	}
	if gpt4oPreview.CandidateCount != 2 || gpt4oPreview.WillAddCount != 2 {
		t.Fatalf("unexpected gpt-4o preview: %+v", *gpt4oPreview)
	}
	if len(gpt4oPreview.Aliases) != 2 {
		t.Fatalf("expected two aliases, got %+v", gpt4oPreview.Aliases)
	}
	foundGemini := false
	for i := range preview.Items {
		if preview.Items[i].ModelName == "gemini-1.5-pro" && len(preview.Items[i].Aliases) == 1 && preview.Items[i].Aliases[0] == "models/gemini-1.5-pro" {
			foundGemini = true
		}
	}
	if !foundGemini {
		t.Fatalf("models/ namespace was not shown as gemini alias: %+v", preview.Items)
	}

	result, err := GroupAutoGenerate(&model.GroupAutoGenerateRequest{
		ModelNames:      []string{"gpt-4o"},
		AssociationMode: model.GroupAutoGenerateAssociationAlias,
	}, ctx)
	if err != nil {
		t.Fatalf("GroupAutoGenerate failed: %v", err)
	}
	if result.CreatedGroups != 1 || result.AddedItems != 2 || result.SelectedModels != 1 {
		t.Fatalf("unexpected alias generation result: %+v", result)
	}

	group := getGroupByNameForTest(t, "gpt-4o")
	if len(group.Items) != 2 {
		t.Fatalf("expected 2 alias-associated items, got %+v", group.Items)
	}
	modelsByChannel := map[int]string{}
	for _, item := range group.Items {
		modelsByChannel[item.ChannelID] = item.ModelName
	}
	if modelsByChannel[first.ID] != "openai/gpt-4o" {
		t.Fatalf("prefixed channel model = %q, want openai/gpt-4o", modelsByChannel[first.ID])
	}
	if modelsByChannel[second.ID] != "gpt-4o" {
		t.Fatalf("plain channel model = %q, want gpt-4o", modelsByChannel[second.ID])
	}
}

func getGroupByNameForTest(t *testing.T, name string) model.Group {
	t.Helper()
	var group model.Group
	if err := dbpkg.GetDB().Preload("Items").Where("name = ?", name).First(&group).Error; err != nil {
		t.Fatalf("get group %q failed: %v", name, err)
	}
	return group
}
