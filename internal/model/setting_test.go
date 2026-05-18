package model

import "testing"

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

