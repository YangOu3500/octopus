package op

import (
	"encoding/json"
	"strings"

	"github.com/bestruirui/octopus/internal/model"
)

type groupAutoGenerateSavedSettings struct {
	AssociationMode    model.GroupAutoGenerateAssociationMode
	AssociationOptions *model.GroupAutoGenerateAssociationOptions
	ManualAliases      []model.GroupAutoGenerateManualAlias
}

func groupAutoGenerateLoadSavedSettings() groupAutoGenerateSavedSettings {
	settings := groupAutoGenerateSavedSettings{
		AssociationMode: model.GroupAutoGenerateAssociationExact,
	}

	if value, err := SettingGetString(model.SettingKeyGroupAutoGenerateAssociationMode); err == nil {
		switch model.GroupAutoGenerateAssociationMode(strings.ToLower(strings.TrimSpace(value))) {
		case model.GroupAutoGenerateAssociationExact, model.GroupAutoGenerateAssociationAlias:
			settings.AssociationMode = model.GroupAutoGenerateAssociationMode(strings.ToLower(strings.TrimSpace(value)))
		}
	}
	if value, err := SettingGetString(model.SettingKeyGroupAutoGenerateAssociationOptions); err == nil && strings.TrimSpace(value) != "" {
		var options model.GroupAutoGenerateAssociationOptions
		if json.Unmarshal([]byte(value), &options) == nil {
			settings.AssociationOptions = &options
		}
	}
	if value, err := SettingGetString(model.SettingKeyGroupAutoGenerateManualAliases); err == nil && strings.TrimSpace(value) != "" {
		var aliases []model.GroupAutoGenerateManualAlias
		if json.Unmarshal([]byte(value), &aliases) == nil {
			settings.ManualAliases = aliases
		}
	}
	return settings
}

