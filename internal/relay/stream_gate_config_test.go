package relay

import (
	"testing"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
)

func TestNewStreamGateConfigUsesGlobalDefaultsAndGroupOverride(t *testing.T) {
	_ = setupRelayTestDB(t)

	if err := op.SettingSetInt(model.SettingKeyStreamFirstValidTimeout, 7); err != nil {
		t.Fatalf("SettingSetInt timeout failed: %v", err)
	}
	if err := op.SettingSetInt(model.SettingKeyStreamFirstValidMaxBuffer, 128); err != nil {
		t.Fatalf("SettingSetInt buffer failed: %v", err)
	}
	if err := op.SettingSetString(model.SettingKeyStreamEmptyDoneAsFailure, "false"); err != nil {
		t.Fatalf("SettingSetString empty done failed: %v", err)
	}
	if err := op.SettingSetString(model.SettingKeyStreamInvalidSSEAsFailure, "false"); err != nil {
		t.Fatalf("SettingSetString invalid sse failed: %v", err)
	}

	global := newStreamGateConfig(0)
	if global.firstValidTimeoutSec != 7 {
		t.Fatalf("expected global timeout 7, got %#v", global)
	}
	if global.maxBufferBytes != 128 {
		t.Fatalf("expected global max buffer 128, got %#v", global)
	}
	if global.emptyDoneAsFailure {
		t.Fatalf("expected empty done failure flag to follow setting, got %#v", global)
	}
	if global.invalidSSEAsFailure {
		t.Fatalf("expected invalid sse failure flag to follow setting, got %#v", global)
	}

	overridden := newStreamGateConfig(3)
	if overridden.firstValidTimeoutSec != 3 {
		t.Fatalf("expected group timeout override 3, got %#v", overridden)
	}
	if overridden.maxBufferBytes != 128 {
		t.Fatalf("expected group override to keep global max buffer 128, got %#v", overridden)
	}
}
