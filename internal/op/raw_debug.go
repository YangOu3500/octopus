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
	return rawDebugSessionRevoke(ctx, session, actorUserID, actorName)
}

func RawDebugSessionRevokeByID(ctx context.Context, sessionID int64, actorUserID int, actorName string) (bool, error) {
	if sessionID <= 0 {
		return false, nil
	}
	var session model.RawDebugSession
	err := db.GetDB().WithContext(ctx).Where("id = ?", sessionID).First(&session).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, nil
		}
		return false, err
	}
	if session.Status != model.RawDebugSessionActive {
		return false, nil
	}
	if session.ExpiresAt <= time.Now().Unix() {
		_ = db.GetDB().WithContext(ctx).Model(&model.RawDebugSession{}).Where("id = ? AND status = ?", session.ID, model.RawDebugSessionActive).Update("status", model.RawDebugSessionExpired).Error
		return false, nil
	}
	return rawDebugSessionRevoke(ctx, session, actorUserID, actorName)
}

func RawDebugSessionList(ctx context.Context, query model.RawDebugSessionListQuery) (model.RawDebugSessionListResult, error) {
	query = normalizeRawDebugSessionListQuery(query)
	if err := rawDebugExpireActiveSessions(ctx); err != nil {
		return model.RawDebugSessionListResult{}, err
	}

	dbQuery := applyRawDebugSessionFilters(db.GetDB().WithContext(ctx).Model(&model.RawDebugSession{}), query)
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return model.RawDebugSessionListResult{}, err
	}

	offset := (query.Page - 1) * query.PageSize
	var items []model.RawDebugSession
	if err := dbQuery.
		Order(rawDebugCreatedAtOrderClause(query.SortOrder)).
		Offset(offset).
		Limit(query.PageSize).
		Find(&items).Error; err != nil {
		return model.RawDebugSessionListResult{}, err
	}
	for i := range items {
		items[i].TokenHash = ""
		items[i].ActorName = sanitizeRawDebugText(items[i].ActorName)
		items[i].Scope = sanitizeRawDebugText(items[i].Scope)
		items[i].Reason = sanitizeRawDebugText(items[i].Reason)
	}

	return model.RawDebugSessionListResult{
		Items:    items,
		Total:    total,
		Page:     query.Page,
		PageSize: query.PageSize,
		HasMore:  int64(offset+len(items)) < total,
	}, nil
}

func RawDebugAuditList(ctx context.Context, query model.RawDebugAuditListQuery) (model.RawDebugAuditListResult, error) {
	query = normalizeRawDebugAuditListQuery(query)

	dbQuery := applyRawDebugAuditFilters(db.GetDB().WithContext(ctx).Model(&model.RawDebugAuditEvent{}), query)
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return model.RawDebugAuditListResult{}, err
	}

	offset := (query.Page - 1) * query.PageSize
	var items []model.RawDebugAuditEvent
	if err := dbQuery.
		Order(rawDebugCreatedAtOrderClause(query.SortOrder)).
		Offset(offset).
		Limit(query.PageSize).
		Find(&items).Error; err != nil {
		return model.RawDebugAuditListResult{}, err
	}
	for i := range items {
		items[i].ActorName = sanitizeRawDebugText(items[i].ActorName)
		items[i].TargetType = sanitizeRawDebugText(items[i].TargetType)
		items[i].TargetID = sanitizeRawDebugText(items[i].TargetID)
		items[i].Scope = sanitizeRawDebugText(items[i].Scope)
		items[i].ErrorSummary = sanitizeRawDebugText(items[i].ErrorSummary)
	}

	return model.RawDebugAuditListResult{
		Items:    items,
		Total:    total,
		Page:     query.Page,
		PageSize: query.PageSize,
		HasMore:  int64(offset+len(items)) < total,
	}, nil
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

func rawDebugSessionRevoke(ctx context.Context, session model.RawDebugSession, actorUserID int, actorName string) (bool, error) {
	now := time.Now().Unix()
	err := db.GetDB().WithContext(ctx).Model(&model.RawDebugSession{}).
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

func rawDebugExpireActiveSessions(ctx context.Context) error {
	return db.GetDB().WithContext(ctx).Model(&model.RawDebugSession{}).
		Where("status = ? AND expires_at <= ?", model.RawDebugSessionActive, time.Now().Unix()).
		Update("status", model.RawDebugSessionExpired).Error
}

func normalizeRawDebugSessionListQuery(query model.RawDebugSessionListQuery) model.RawDebugSessionListQuery {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 || query.PageSize > 100 {
		query.PageSize = 20
	}
	query.Status = strings.ToLower(strings.TrimSpace(query.Status))
	query.Scope = strings.TrimSpace(query.Scope)
	query.ActorName = strings.TrimSpace(query.ActorName)
	query.SortOrder = strings.ToLower(strings.TrimSpace(query.SortOrder))
	if query.SortOrder != "asc" {
		query.SortOrder = "desc"
	}
	return query
}

func normalizeRawDebugAuditListQuery(query model.RawDebugAuditListQuery) model.RawDebugAuditListQuery {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 || query.PageSize > 100 {
		query.PageSize = 20
	}
	query.Action = strings.ToLower(strings.TrimSpace(query.Action))
	query.TargetType = strings.TrimSpace(query.TargetType)
	query.Scope = strings.TrimSpace(query.Scope)
	query.ActorName = strings.TrimSpace(query.ActorName)
	query.SortOrder = strings.ToLower(strings.TrimSpace(query.SortOrder))
	if query.SortOrder != "asc" {
		query.SortOrder = "desc"
	}
	return query
}

func applyRawDebugSessionFilters(query *gorm.DB, filter model.RawDebugSessionListQuery) *gorm.DB {
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Scope != "" {
		query = query.Where("scope LIKE ?", rawDebugLike(filter.Scope))
	}
	if filter.ActorName != "" {
		query = query.Where("actor_name LIKE ?", rawDebugLike(filter.ActorName))
	}
	if filter.StartTime != nil {
		query = query.Where("created_at >= ?", *filter.StartTime)
	}
	if filter.EndTime != nil {
		query = query.Where("created_at <= ?", *filter.EndTime)
	}
	return query
}

func applyRawDebugAuditFilters(query *gorm.DB, filter model.RawDebugAuditListQuery) *gorm.DB {
	if filter.SessionID > 0 {
		query = query.Where("session_id = ?", filter.SessionID)
	}
	if filter.Action != "" {
		query = query.Where("action = ?", filter.Action)
	}
	if filter.TargetType != "" {
		query = query.Where("target_type = ?", filter.TargetType)
	}
	if filter.Scope != "" {
		query = query.Where("scope LIKE ?", rawDebugLike(filter.Scope))
	}
	if filter.ActorName != "" {
		query = query.Where("actor_name LIKE ?", rawDebugLike(filter.ActorName))
	}
	if filter.Success != nil {
		query = query.Where("success = ?", *filter.Success)
	}
	if filter.StartTime != nil {
		query = query.Where("created_at >= ?", *filter.StartTime)
	}
	if filter.EndTime != nil {
		query = query.Where("created_at <= ?", *filter.EndTime)
	}
	return query
}

func rawDebugCreatedAtOrderClause(sortOrder string) string {
	if strings.EqualFold(sortOrder, "asc") {
		return "created_at ASC, id ASC"
	}
	return "created_at DESC, id DESC"
}

func rawDebugLike(value string) string {
	return "%" + strings.TrimSpace(value) + "%"
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
