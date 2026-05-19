package op

import (
	"testing"

	"github.com/bestruirui/octopus/internal/model"
)

func TestRawDebugConfigFromSettingsDefaultsToSafeDisabled(t *testing.T) {
	_ = setupSiteOpTestDB(t)

	cfg := RawDebugConfigFromSettings()
	if cfg.Enabled {
		t.Fatalf("raw debug should default disabled: %+v", cfg)
	}
	if cfg.CaptureRequestBody || cfg.CaptureResponseBody || cfg.CaptureHeaders {
		t.Fatalf("raw debug capture flags should default off: %+v", cfg)
	}
	if !cfg.RedactAuthHeaders {
		t.Fatalf("raw debug auth header redaction should default on: %+v", cfg)
	}
	if cfg.SessionTTLSeconds != model.RawDebugDefaultSessionTTLSeconds ||
		cfg.MaxCaptureBytes != model.RawDebugDefaultMaxCaptureBytes ||
		cfg.RetentionMinutes != model.RawDebugDefaultRetentionMinutes {
		t.Fatalf("unexpected raw debug defaults: %+v", cfg)
	}
}

func TestRawDebugConfigFromSettingsReadsValidatedValues(t *testing.T) {
	_ = setupSiteOpTestDB(t)

	settings := map[model.SettingKey]string{
		model.SettingKeyRawDebugEnabled:             "true",
		model.SettingKeyRawDebugSessionTTLSeconds:   "600",
		model.SettingKeyRawDebugMaxCaptureBytes:     "131072",
		model.SettingKeyRawDebugRetentionMinutes:    "60",
		model.SettingKeyRawDebugCaptureRequestBody:  "true",
		model.SettingKeyRawDebugCaptureResponseBody: "true",
		model.SettingKeyRawDebugCaptureHeaders:      "true",
		model.SettingKeyRawDebugRedactAuthHeaders:   "true",
	}
	for key, value := range settings {
		if err := SettingSetString(key, value); err != nil {
			t.Fatalf("SettingSetString %s failed: %v", key, err)
		}
	}

	cfg := RawDebugConfigFromSettings()
	if !cfg.Enabled || !cfg.CaptureRequestBody || !cfg.CaptureResponseBody || !cfg.CaptureHeaders || !cfg.RedactAuthHeaders {
		t.Fatalf("raw debug bool settings not loaded: %+v", cfg)
	}
	if cfg.SessionTTLSeconds != 600 || cfg.MaxCaptureBytes != 131072 || cfg.RetentionMinutes != 60 {
		t.Fatalf("raw debug numeric settings not loaded: %+v", cfg)
	}
}
