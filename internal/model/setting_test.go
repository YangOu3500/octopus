package model

import (
	"encoding/json"
	"testing"
)

func TestSettingValidateGroupAutoGenerateAssociationMode(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{name: "exact", value: "exact"},
		{name: "alias", value: "alias"},
		{name: "invalid", value: "unknown", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := (&Setting{
				Key:   SettingKeyGroupAutoGenerateAssociationMode,
				Value: tt.value,
			}).Validate()
			if tt.wantErr && err == nil {
				t.Fatalf("Validate() error = nil, want error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("Validate() error = %v, want nil", err)
			}
		})
	}
}

func TestSettingValidateGroupAutoGenerateAssociationOptions(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{name: "empty object", value: "{}"},
		{name: "known fields", value: `{"strip_provider_prefix":true,"normalize_case":false}`},
		{name: "invalid json", value: "{", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := (&Setting{
				Key:   SettingKeyGroupAutoGenerateAssociationOptions,
				Value: tt.value,
			}).Validate()
			if tt.wantErr && err == nil {
				t.Fatalf("Validate() error = nil, want error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("Validate() error = %v, want nil", err)
			}
		})
	}
}

func TestSettingValidateGroupAutoGenerateManualAliases(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{name: "empty list", value: "[]"},
		{name: "valid aliases", value: `[{"alias":"gpt4o-mini-preview","target":"gpt-4o-mini"}]`},
		{name: "missing target", value: `[{"alias":"gpt4o-mini-preview","target":""}]`, wantErr: true},
		{name: "invalid json", value: "[", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := (&Setting{
				Key:   SettingKeyGroupAutoGenerateManualAliases,
				Value: tt.value,
			}).Validate()
			if tt.wantErr && err == nil {
				t.Fatalf("Validate() error = nil, want error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("Validate() error = %v, want nil", err)
			}
		})
	}
}

func TestSettingValidateGroupAutoGenerateAssociationTags(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{name: "empty list", value: "[]"},
		{name: "valid tags", value: `[{"label":"Claude Sonnet","target":"claude-sonnet","aliases":["anthropic/claude-3.5-sonnet","claude-3-5-sonnet"]}]`},
		{name: "invalid json", value: "[", wantErr: true},
		{name: "missing label", value: `[{"label":"","target":"claude-sonnet","aliases":["claude-3-5-sonnet"]}]`, wantErr: true},
		{name: "missing target", value: `[{"label":"Claude Sonnet","target":"","aliases":["claude-3-5-sonnet"]}]`, wantErr: true},
		{name: "missing aliases", value: `[{"label":"Claude Sonnet","target":"claude-sonnet","aliases":[]}]`, wantErr: true},
		{name: "empty aliases", value: `[{"label":"Claude Sonnet","target":"claude-sonnet","aliases":[" "]}]`, wantErr: true},
		{name: "too many aliases", value: mustMarshalAssociationTagsForTest([]GroupAutoGenerateAssociationTag{{
			Label:   "Claude Sonnet",
			Target:  "claude-sonnet",
			Aliases: makeAssociationAliasesForTest(51),
		}}), wantErr: true},
		{name: "too many tags", value: mustMarshalAssociationTagsForTest(makeAssociationTagsForTest(101)), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := (&Setting{
				Key:   SettingKeyGroupAutoGenerateAssociationTags,
				Value: tt.value,
			}).Validate()
			if tt.wantErr && err == nil {
				t.Fatalf("Validate() error = nil, want error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("Validate() error = %v, want nil", err)
			}
		})
	}
}

func mustMarshalAssociationTagsForTest(tags []GroupAutoGenerateAssociationTag) string {
	data, err := json.Marshal(tags)
	if err != nil {
		panic(err)
	}
	return string(data)
}

func makeAssociationAliasesForTest(count int) []string {
	aliases := make([]string, 0, count)
	for i := 0; i < count; i++ {
		aliases = append(aliases, "alias-"+string(rune('a'+i%26)))
	}
	return aliases
}

func makeAssociationTagsForTest(count int) []GroupAutoGenerateAssociationTag {
	tags := make([]GroupAutoGenerateAssociationTag, 0, count)
	for i := 0; i < count; i++ {
		tags = append(tags, GroupAutoGenerateAssociationTag{
			Label:   "Label",
			Target:  "target",
			Aliases: []string{"alias"},
		})
	}
	return tags
}
