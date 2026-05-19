package op

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/utils/snowflake"
	"gorm.io/gorm"
)

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

func RawDebugSessionCreate(ctx context.Context, req model.RawDebugSessionCreateRequest) (model.RawDebugSessionAuthorization, error) {
	cfg := RawDebugConfigFromSettings()
	if !cfg.Enabled {
		return model.RawDebugSessionAuthorization{}, fmt.Errorf("raw debug is disabled")
	}

	token, tokenHash, err := newRawDebugToken()
	if err != nil {
		return model.RawDebugSessionAuthorization{}, err
	}
	now := time.Now().Unix()
	session := model.RawDebugSession{
		ID:                  snowflake.GenerateID(),
		TokenHash:           tokenHash,
		Status:              model.RawDebugSessionActive,
		ActorUserID:         req.ActorUserID,
		ActorName:           sanitizeRawDebugText(req.ActorName),
		Scope:               sanitizeRawDebugText(req.Scope),
		Reason:              sanitizeRawDebugText(req.Reason),
		MaxCaptureBytes:     cfg.MaxCaptureBytes,
		CaptureRequestBody:  cfg.CaptureRequestBody,
		CaptureResponseBody: cfg.CaptureResponseBody,
		CaptureHeaders:      cfg.CaptureHeaders,
		RedactAuthHeaders:   cfg.RedactAuthHeaders,
		CreatedAt:           now,
		ExpiresAt:           now + int64(cfg.SessionTTLSeconds),
	}

	if err := db.GetDB().WithContext(ctx).Create(&session).Error; err != nil {
		return model.RawDebugSessionAuthorization{}, err
	}
	_ = RawDebugAuditRecord(ctx, model.RawDebugAuditEvent{
		SessionID:           session.ID,
		ActorUserID:         session.ActorUserID,
		ActorName:           session.ActorName,
		Action:              model.RawDebugAuditActionSessionCreate,
		Scope:               session.Scope,
		Success:             true,
		CaptureRequestBody:  session.CaptureRequestBody,
		CaptureResponseBody: session.CaptureResponseBody,
		CaptureHeaders:      session.CaptureHeaders,
		RedactAuthHeaders:   session.RedactAuthHeaders,
	})

	return model.RawDebugSessionAuthorization{
		Session: session,
		Token:   token,
	}, nil
}

func RawDebugSessionVerify(ctx context.Context, token string) (model.RawDebugSession, bool, error) {
	tokenHash := rawDebugTokenHash(token)
	if tokenHash == "" {
		return model.RawDebugSession{}, false, nil
	}
	var session model.RawDebugSession
	err := db.GetDB().WithContext(ctx).Where("token_hash = ?", tokenHash).First(&session).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return model.RawDebugSession{}, false, nil
		}
		return model.RawDebugSession{}, false, err
	}
	now := time.Now().Unix()
	if session.Status != model.RawDebugSessionActive {
		return session, false, nil
	}
	if session.ExpiresAt <= now {
		_ = db.GetDB().WithContext(ctx).Model(&model.RawDebugSession{}).Where("id = ? AND status = ?", session.ID, model.RawDebugSessionActive).Update("status", model.RawDebugSessionExpired).Error
		session.Status = model.RawDebugSessionExpired
		return session, false, nil
	}
	return session, true, nil
}

func RawDebugSessionRevoke(ctx context.Context, token string, actorUserID int, actorName string) (bool, error) {
	session, ok, err := RawDebugSessionVerify(ctx, token)
	if err != nil || !ok {
		return false, err
	}
	now := time.Now().Unix()
	err = db.GetDB().WithContext(ctx).Model(&model.RawDebugSession{}).
		Where("id = ? AND status = ?", session.ID, model.RawDebugSessionActive).
		Updates(map[string]any{
			"status":     model.RawDebugSessionRevoked,
			"revoked_at": now,
		}).Error
	if err != nil {
		return false, err
	}
	_ = RawDebugAuditRecord(ctx, model.RawDebugAuditEvent{
		SessionID:           session.ID,
		ActorUserID:         actorUserID,
		ActorName:           sanitizeRawDebugText(actorName),
		Action:              model.RawDebugAuditActionSessionRevoke,
		Scope:               session.Scope,
		Success:             true,
		CaptureRequestBody:  session.CaptureRequestBody,
		CaptureResponseBody: session.CaptureResponseBody,
		CaptureHeaders:      session.CaptureHeaders,
		RedactAuthHeaders:   session.RedactAuthHeaders,
	})
	return true, nil
}

func RawDebugAuditRecord(ctx context.Context, event model.RawDebugAuditEvent) error {
	if event.ID == 0 {
		event.ID = snowflake.GenerateID()
	}
	if event.CreatedAt == 0 {
		event.CreatedAt = time.Now().Unix()
	}
	event.ActorName = sanitizeRawDebugText(event.ActorName)
	event.TargetType = sanitizeRawDebugText(event.TargetType)
	event.TargetID = sanitizeRawDebugText(event.TargetID)
	event.Scope = sanitizeRawDebugText(event.Scope)
	event.ErrorSummary = sanitizeRawDebugText(event.ErrorSummary)
	return db.GetDB().WithContext(ctx).Create(&event).Error
}

func newRawDebugToken() (string, string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", "", err
	}
	token := hex.EncodeToString(bytes)
	return token, rawDebugTokenHash(token), nil
}

func rawDebugTokenHash(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func sanitizeRawDebugText(value string) string {
	return sanitizeRelayLogText(strings.TrimSpace(value))
}
