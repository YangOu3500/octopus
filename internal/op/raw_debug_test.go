package op

import (
	"strings"
	"testing"
	"time"

	dbpkg "github.com/bestruirui/octopus/internal/db"
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

func TestRawDebugSessionCreateRejectsDisabledConfig(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	if _, err := RawDebugSessionCreate(ctx, model.RawDebugSessionCreateRequest{
		ActorUserID: 1,
		ActorName:   "admin",
		Scope:       "trace",
		Reason:      "debug",
	}); err == nil {
		t.Fatalf("expected disabled raw debug to reject session creation")
	}
}

func TestRawDebugSessionLifecycleStoresOnlyTokenHash(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	enableRawDebugForTest(t)

	auth, err := RawDebugSessionCreate(ctx, model.RawDebugSessionCreateRequest{
		ActorUserID: 7,
		ActorName:   "admin Authorization: Bearer secret-token",
		Scope:       "trace:abc",
		Reason:      "investigate x-api-key: sk-session-secret123456",
	})
	if err != nil {
		t.Fatalf("RawDebugSessionCreate failed: %v", err)
	}
	if strings.TrimSpace(auth.Token) == "" {
		t.Fatalf("expected one-time raw debug token")
	}
	if auth.Session.TokenHash != rawDebugTokenHash(auth.Token) {
		t.Fatalf("session token hash was not returned in session metadata for internal use")
	}
	if strings.Contains(auth.Session.ActorName, "secret-token") || strings.Contains(auth.Session.Reason, "sk-session-secret123456") {
		t.Fatalf("session metadata was not sanitized: %+v", auth.Session)
	}

	var stored model.RawDebugSession
	if err := dbpkg.GetDB().WithContext(ctx).Where("id = ?", auth.Session.ID).First(&stored).Error; err != nil {
		t.Fatalf("query stored session failed: %v", err)
	}
	if stored.TokenHash == "" || strings.Contains(stored.TokenHash, auth.Token) || stored.TokenHash == auth.Token {
		t.Fatalf("stored token hash leaked token: token=%q hash=%q", auth.Token, stored.TokenHash)
	}

	verified, ok, err := RawDebugSessionVerify(ctx, auth.Token)
	if err != nil {
		t.Fatalf("RawDebugSessionVerify failed: %v", err)
	}
	if !ok || verified.ID != auth.Session.ID {
		t.Fatalf("expected active verified session, ok=%t session=%+v", ok, verified)
	}
	if _, ok, err := RawDebugSessionVerify(ctx, "bad-token"); err != nil || ok {
		t.Fatalf("expected bad token to fail cleanly, ok=%t err=%v", ok, err)
	}

	revoked, err := RawDebugSessionRevoke(ctx, auth.Token, 8, "operator")
	if err != nil {
		t.Fatalf("RawDebugSessionRevoke failed: %v", err)
	}
	if !revoked {
		t.Fatalf("expected revoke to return true")
	}
	afterRevoke, ok, err := RawDebugSessionVerify(ctx, auth.Token)
	if err != nil {
		t.Fatalf("RawDebugSessionVerify after revoke failed: %v", err)
	}
	if ok || afterRevoke.Status != model.RawDebugSessionRevoked {
		t.Fatalf("expected revoked session to be inactive, ok=%t session=%+v", ok, afterRevoke)
	}
}

func TestRawDebugSessionVerifyExpiresSession(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	enableRawDebugForTest(t)

	auth, err := RawDebugSessionCreate(ctx, model.RawDebugSessionCreateRequest{ActorName: "admin"})
	if err != nil {
		t.Fatalf("RawDebugSessionCreate failed: %v", err)
	}
	if err := dbpkg.GetDB().WithContext(ctx).Model(&model.RawDebugSession{}).Where("id = ?", auth.Session.ID).Update("expires_at", time.Now().Add(-time.Minute).Unix()).Error; err != nil {
		t.Fatalf("expire session failed: %v", err)
	}

	session, ok, err := RawDebugSessionVerify(ctx, auth.Token)
	if err != nil {
		t.Fatalf("RawDebugSessionVerify failed: %v", err)
	}
	if ok || session.Status != model.RawDebugSessionExpired {
		t.Fatalf("expected expired inactive session, ok=%t session=%+v", ok, session)
	}
}

func TestRawDebugAuditRecordSanitizesMetadata(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	err := RawDebugAuditRecord(ctx, model.RawDebugAuditEvent{
		ActorUserID:  1,
		ActorName:    "admin",
		Action:       model.RawDebugAuditActionAccess,
		TargetType:   "trace",
		TargetID:     "trace-1",
		Scope:        "Authorization: Bearer secret-token",
		ErrorSummary: "x-api-key: sk-audit-secret123456",
		Success:      false,
	})
	if err != nil {
		t.Fatalf("RawDebugAuditRecord failed: %v", err)
	}
	var event model.RawDebugAuditEvent
	if err := dbpkg.GetDB().WithContext(ctx).First(&event).Error; err != nil {
		t.Fatalf("query audit event failed: %v", err)
	}
	if strings.Contains(event.Scope, "secret-token") || strings.Contains(event.ErrorSummary, "sk-audit-secret123456") {
		t.Fatalf("audit event leaked sensitive metadata: %+v", event)
	}
	if !strings.Contains(event.Scope, "[REDACTED]") || !strings.Contains(event.ErrorSummary, "[REDACTED]") {
		t.Fatalf("expected audit event redaction markers: %+v", event)
	}
}

func enableRawDebugForTest(t *testing.T) {
	t.Helper()
	settings := map[model.SettingKey]string{
		model.SettingKeyRawDebugEnabled:             "true",
		model.SettingKeyRawDebugCaptureRequestBody:  "true",
		model.SettingKeyRawDebugCaptureResponseBody: "true",
		model.SettingKeyRawDebugCaptureHeaders:      "true",
	}
	for key, value := range settings {
		if err := SettingSetString(key, value); err != nil {
			t.Fatalf("SettingSetString %s failed: %v", key, err)
		}
	}
}
