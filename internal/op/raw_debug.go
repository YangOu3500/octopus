package op

import "github.com/bestruirui/octopus/internal/model"

func RawDebugConfigFromSettings() model.RawDebugConfig {
	cfg := model.DefaultRawDebugConfig()

	if value, err := SettingGetBool(model.SettingKeyRawDebugEnabled); err == nil {
		cfg.Enabled = value
	}
	if value, err := SettingGetInt(model.SettingKeyRawDebugSessionTTLSeconds); err == nil {
		cfg.SessionTTLSeconds = value
	}
	if value, err := SettingGetInt(model.SettingKeyRawDebugMaxCaptureBytes); err == nil {
		cfg.MaxCaptureBytes = value
	}
	if value, err := SettingGetInt(model.SettingKeyRawDebugRetentionMinutes); err == nil {
		cfg.RetentionMinutes = value
	}
	if value, err := SettingGetBool(model.SettingKeyRawDebugCaptureRequestBody); err == nil {
		cfg.CaptureRequestBody = value
	}
	if value, err := SettingGetBool(model.SettingKeyRawDebugCaptureResponseBody); err == nil {
		cfg.CaptureResponseBody = value
	}
	if value, err := SettingGetBool(model.SettingKeyRawDebugCaptureHeaders); err == nil {
		cfg.CaptureHeaders = value
	}
	if value, err := SettingGetBool(model.SettingKeyRawDebugRedactAuthHeaders); err == nil {
		cfg.RedactAuthHeaders = value
	}

	return cfg
}
