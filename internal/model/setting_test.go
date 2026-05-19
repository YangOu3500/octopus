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

func TestSettingValidateRawDebugSettings(t *testing.T) {
	tests := []struct {
		name    string
		key     SettingKey
		value   string
		wantErr bool
	}{
		{name: "enabled false", key: SettingKeyRawDebugEnabled, value: "false"},
		{name: "enabled invalid", key: SettingKeyRawDebugEnabled, value: "yes", wantErr: true},
		{name: "capture request false", key: SettingKeyRawDebugCaptureRequestBody, value: "false"},
		{name: "capture response true", key: SettingKeyRawDebugCaptureResponseBody, value: "true"},
		{name: "capture headers invalid", key: SettingKeyRawDebugCaptureHeaders, value: "1", wantErr: true},
		{name: "redact auth headers true", key: SettingKeyRawDebugRedactAuthHeaders, value: "true"},
		{name: "session ttl min", key: SettingKeyRawDebugSessionTTLSeconds, value: "60"},
		{name: "session ttl max", key: SettingKeyRawDebugSessionTTLSeconds, value: "3600"},
		{name: "session ttl too low", key: SettingKeyRawDebugSessionTTLSeconds, value: "59", wantErr: true},
		{name: "session ttl too high", key: SettingKeyRawDebugSessionTTLSeconds, value: "3601", wantErr: true},
		{name: "max capture min", key: SettingKeyRawDebugMaxCaptureBytes, value: "1024"},
		{name: "max capture max", key: SettingKeyRawDebugMaxCaptureBytes, value: "1048576"},
		{name: "max capture too low", key: SettingKeyRawDebugMaxCaptureBytes, value: "1023", wantErr: true},
		{name: "max capture too high", key: SettingKeyRawDebugMaxCaptureBytes, value: "1048577", wantErr: true},
		{name: "retention min", key: SettingKeyRawDebugRetentionMinutes, value: "1"},
		{name: "retention max", key: SettingKeyRawDebugRetentionMinutes, value: "1440"},
		{name: "retention too low", key: SettingKeyRawDebugRetentionMinutes, value: "0", wantErr: true},
		{name: "retention too high", key: SettingKeyRawDebugRetentionMinutes, value: "1441", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := (&Setting{Key: tt.key, Value: tt.value}).Validate()
			if tt.wantErr && err == nil {
				t.Fatalf("Validate() error = nil, want error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("Validate() error = %v, want nil", err)
			}
		})
	}
}

func TestDefaultSettingsIncludeRawDebugSafeDefaults(t *testing.T) {
	values := make(map[SettingKey]string)
	for _, setting := range DefaultSettings() {
		values[setting.Key] = setting.Value
	}

	expected := map[SettingKey]string{
		SettingKeyRawDebugEnabled:             "false",
		SettingKeyRawDebugSessionTTLSeconds:   "300",
		SettingKeyRawDebugMaxCaptureBytes:     "65536",
		SettingKeyRawDebugRetentionMinutes:    "30",
		SettingKeyRawDebugCaptureRequestBody:  "false",
		SettingKeyRawDebugCaptureResponseBody: "false",
		SettingKeyRawDebugCaptureHeaders:      "false",
		SettingKeyRawDebugRedactAuthHeaders:   "true",
	}
	for key, want := range expected {
		if got := values[key]; got != want {
			t.Fatalf("default setting %s = %q, want %q", key, got, want)
		}
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
