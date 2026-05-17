package relay

import (
	dbmodel "github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
)

const (
	defaultStreamFirstValidTimeoutSeconds = 15
	defaultStreamFirstValidMaxBufferBytes = 64 * 1024
)

type streamGateConfig struct {
	firstValidTimeoutSec int
	maxBufferBytes       int
	emptyDoneAsFailure   bool
	invalidSSEAsFailure  bool
	loaded               bool
}

func newStreamGateConfig(groupFirstTokenTimeOutSec int) streamGateConfig {
	cfg := streamGateConfig{
		firstValidTimeoutSec: settingIntOrDefault(dbmodel.SettingKeyStreamFirstValidTimeout, defaultStreamFirstValidTimeoutSeconds),
		maxBufferBytes:       settingIntOrDefault(dbmodel.SettingKeyStreamFirstValidMaxBuffer, defaultStreamFirstValidMaxBufferBytes),
		emptyDoneAsFailure:   settingBoolOrDefault(dbmodel.SettingKeyStreamEmptyDoneAsFailure, true),
		invalidSSEAsFailure:  settingBoolOrDefault(dbmodel.SettingKeyStreamInvalidSSEAsFailure, true),
		loaded:               true,
	}
	if cfg.firstValidTimeoutSec < 0 {
		cfg.firstValidTimeoutSec = defaultStreamFirstValidTimeoutSeconds
	}
	if cfg.maxBufferBytes <= 0 {
		cfg.maxBufferBytes = defaultStreamFirstValidMaxBufferBytes
	}
	if groupFirstTokenTimeOutSec > 0 {
		cfg.firstValidTimeoutSec = groupFirstTokenTimeOutSec
	}
	return cfg
}

func (ra *relayAttempt) resolvedStreamGateConfig() streamGateConfig {
	if ra != nil && ra.streamGate.loaded {
		cfg := ra.streamGate
		if cfg.maxBufferBytes <= 0 {
			cfg.maxBufferBytes = defaultStreamFirstValidMaxBufferBytes
		}
		return cfg
	}
	cfg := streamGateConfig{
		maxBufferBytes:      defaultStreamFirstValidMaxBufferBytes,
		emptyDoneAsFailure:  true,
		invalidSSEAsFailure: true,
		loaded:              true,
	}
	if ra != nil && ra.firstTokenTimeOutSec > 0 {
		cfg.firstValidTimeoutSec = ra.firstTokenTimeOutSec
	}
	return cfg
}

func settingIntOrDefault(key dbmodel.SettingKey, fallback int) int {
	value, err := op.SettingGetInt(key)
	if err == nil {
		return value
	}
	return fallback
}

func settingBoolOrDefault(key dbmodel.SettingKey, fallback bool) bool {
	value, err := op.SettingGetBool(key)
	if err == nil {
		return value
	}
	return fallback
}
