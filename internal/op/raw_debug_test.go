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

func TestRawDebugSessionAndAuditListExposeOnlyMetadata(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	enableRawDebugForTest(t)

	authz, err := RawDebugSessionCreate(ctx, model.RawDebugSessionCreateRequest{
		ActorUserID: 3,
		ActorName:   "admin",
		Scope:       "trace:abc Authorization: Bearer secret-token",
		Reason:      "inspect sk-list-secret123456",
	})
	if err != nil {
		t.Fatalf("RawDebugSessionCreate failed: %v", err)
	}

	revoked, err := RawDebugSessionRevokeByID(ctx, authz.Session.ID, 3, "admin")
	if err != nil {
		t.Fatalf("RawDebugSessionRevokeByID failed: %v", err)
	}
	if !revoked {
		t.Fatalf("expected session to be revoked by id")
	}

	sessions, err := RawDebugSessionList(ctx, model.RawDebugSessionListQuery{
		Page:     1,
		PageSize: 10,
		Status:   string(model.RawDebugSessionRevoked),
		Scope:    "trace",
	})
	if err != nil {
		t.Fatalf("RawDebugSessionList failed: %v", err)
	}
	if sessions.Total != 1 || len(sessions.Items) != 1 {
		t.Fatalf("unexpected session list result: %+v", sessions)
	}
	if sessions.Items[0].TokenHash != "" {
		t.Fatalf("session list exposed token hash: %+v", sessions.Items[0])
	}
	if strings.Contains(sessions.Items[0].Scope, "secret-token") || strings.Contains(sessions.Items[0].Reason, "sk-list-secret123456") {
		t.Fatalf("session list leaked sensitive metadata: %+v", sessions.Items[0])
	}

	audit, err := RawDebugAuditList(ctx, model.RawDebugAuditListQuery{
		Page:      1,
		PageSize:  10,
		SessionID: authz.Session.ID,
	})
	if err != nil {
		t.Fatalf("RawDebugAuditList failed: %v", err)
	}
	if audit.Total != 2 || len(audit.Items) != 2 {
		t.Fatalf("expected create and revoke audit events, got %+v", audit)
	}
	for _, event := range audit.Items {
		if strings.Contains(event.Scope, "secret-token") || strings.Contains(event.ErrorSummary, "sk-list-secret123456") {
			t.Fatalf("audit list leaked sensitive metadata: %+v", event)
		}
	}
}

func TestRawDebugCaptureRecordListAndExportAreScopedAndSanitized(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	enableRawDebugForTest(t)

	authz, err := RawDebugSessionCreate(ctx, model.RawDebugSessionCreateRequest{
		ActorUserID: 9,
		ActorName:   "admin",
		Scope:       "trace:capture",
		Reason:      "investigate",
	})
	if err != nil {
		t.Fatalf("RawDebugSessionCreate failed: %v", err)
	}

	capture, err := RawDebugCaptureRecord(ctx, model.RawDebugCaptureInput{
		Session: authz.Session,
		RelayLog: model.RelayLog{
			ID:               1001,
			TraceID:          "trace-capture",
			ClientAPIKeyID:   3,
			GroupID:          4,
			ChannelId:        5,
			ChannelName:      "primary",
			RequestModelName: "gpt-test",
			ActualModelName:  "upstream-test",
			RequestStream:    false,
			RequestSource:    "relay",
			ClientIP:         "127.0.0.1",
			Error:            "Authorization: Bearer log-secret",
			Attempts:         []model.ChannelAttempt{{HTTPStatus: 200}},
		},
		RequestHeaders: map[string][]string{
			"Authorization": {"Bearer request-secret"},
			"X-Trace":       {"ok"},
		},
		ResponseHeaders: map[string][]string{
			"Set-Cookie": {"sid=response-secret"},
			"X-Upstream": {"ok"},
		},
		RequestBody:  []byte(`{"model":"gpt-test","api_key":"sk-capture-secret123456","messages":[{"content":"hello"}]}`),
		ResponseBody: []byte(`{"choices":[{"message":{"content":"ok"}}],"authorization":"Bearer response-secret"}`),
		HTTPStatus:   200,
		Success:      true,
	})
	if err != nil {
		t.Fatalf("RawDebugCaptureRecord failed: %v", err)
	}
	if capture.ID == 0 {
		t.Fatalf("expected capture id")
	}
	if strings.Contains(capture.RequestHeaders, "request-secret") ||
		strings.Contains(capture.ResponseHeaders, "response-secret") ||
		strings.Contains(capture.RequestBody, "sk-capture-secret123456") ||
		strings.Contains(capture.ResponseBody, "response-secret") {
		t.Fatalf("capture leaked sensitive content: %+v", capture)
	}

	list, err := RawDebugCaptureList(ctx, model.RawDebugCaptureListQuery{Page: 1, PageSize: 10, TraceID: "trace-capture"})
	if err != nil {
		t.Fatalf("RawDebugCaptureList failed: %v", err)
	}
	if list.Total != 1 || len(list.Items) != 1 {
		t.Fatalf("unexpected capture list: %+v", list)
	}
	if list.Items[0].RequestBody != "" || list.Items[0].ResponseBody != "" || list.Items[0].RequestHeaders != "" {
		t.Fatalf("capture list should omit raw fields: %+v", list.Items[0])
	}

	detail, err := RawDebugCaptureGet(ctx, capture.ID, 9, "admin")
	if err != nil {
		t.Fatalf("RawDebugCaptureGet failed: %v", err)
	}
	if detail.RequestBody == "" || detail.ResponseBody == "" {
		t.Fatalf("capture detail should include captured bodies: %+v", detail)
	}

	exported, err := RawDebugCaptureExport(ctx, capture.ID, 9, "admin")
	if err != nil {
		t.Fatalf("RawDebugCaptureExport failed: %v", err)
	}
	if exported.ID != capture.ID {
		t.Fatalf("unexpected exported capture: %+v", exported)
	}

	var auditEvents []model.RawDebugAuditEvent
	if err := dbpkg.GetDB().WithContext(ctx).Where("session_id = ?", authz.Session.ID).Find(&auditEvents).Error; err != nil {
		t.Fatalf("query audit events failed: %v", err)
	}
	var sawCapture, sawAccess, sawExport bool
	for _, event := range auditEvents {
		switch event.Action {
		case model.RawDebugAuditActionCapture:
			sawCapture = true
		case model.RawDebugAuditActionAccess:
			sawAccess = true
		case model.RawDebugAuditActionExport:
			sawExport = true
		}
	}
	if !sawCapture || !sawAccess || !sawExport {
		t.Fatalf("expected capture/access/export audit events, got %+v", auditEvents)
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
