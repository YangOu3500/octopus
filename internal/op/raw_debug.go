package op

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
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

func RawDebugCaptureRecord(ctx context.Context, input model.RawDebugCaptureInput) (model.RawDebugCapture, error) {
	session := input.Session
	if session.ID == 0 || session.Status != model.RawDebugSessionActive {
		return model.RawDebugCapture{}, nil
	}
	if !RawDebugConfigFromSettings().Enabled {
		return model.RawDebugCapture{}, nil
	}
	if session.ExpiresAt <= time.Now().Unix() {
		_ = db.GetDB().WithContext(ctx).Model(&model.RawDebugSession{}).Where("id = ? AND status = ?", session.ID, model.RawDebugSessionActive).Update("status", model.RawDebugSessionExpired).Error
		return model.RawDebugCapture{}, nil
	}
	if err := rawDebugCaptureCleanup(ctx); err != nil {
		return model.RawDebugCapture{}, err
	}

	relayLog := input.RelayLog
	httpStatus := input.HTTPStatus
	if httpStatus == 0 {
		httpStatus = rawDebugFinalHTTPStatus(relayLog)
	}
	now := time.Now().Unix()
	capture := model.RawDebugCapture{
		ID:               snowflake.GenerateID(),
		SessionID:        session.ID,
		TraceID:          relayLog.TraceID,
		RelayLogID:       relayLog.ID,
		APIKeyID:         relayLog.ClientAPIKeyID,
		GroupID:          relayLog.GroupID,
		ChannelID:        relayLog.ChannelId,
		ChannelName:      sanitizeRawDebugText(relayLog.ChannelName),
		RequestModelName: sanitizeRawDebugText(relayLog.RequestModelName),
		ActualModelName:  sanitizeRawDebugText(relayLog.ActualModelName),
		RequestStream:    relayLog.RequestStream,
		RequestSource:    sanitizeRawDebugText(relayLog.RequestSource),
		ClientIP:         sanitizeRawDebugText(relayLog.ClientIP),
		HTTPStatus:       httpStatus,
		Success:          input.Success,
		ErrorSummary:     sanitizeRawDebugText(input.ErrorSummary),
		CreatedAt:        now,
	}
	if capture.ErrorSummary == "" {
		capture.ErrorSummary = sanitizeRawDebugText(relayLog.Error)
	}
	if session.CaptureHeaders {
		capture.RequestHeaders = marshalRawDebugHeaders(input.RequestHeaders, session.RedactAuthHeaders)
		capture.ResponseHeaders = marshalRawDebugHeaders(input.ResponseHeaders, session.RedactAuthHeaders)
	}
	if session.CaptureRequestBody {
		capture.RequestBody, capture.RequestBodyTruncated = sanitizeRawDebugBytes(input.RequestBody, session.MaxCaptureBytes)
		capture.RequestBodyTruncated = capture.RequestBodyTruncated || input.RequestBodyTruncated
	}
	if session.CaptureResponseBody {
		capture.ResponseBody, capture.ResponseBodyTruncated = sanitizeRawDebugBytes(input.ResponseBody, session.MaxCaptureBytes)
		capture.ResponseBodyTruncated = capture.ResponseBodyTruncated || input.ResponseBodyTruncated
	}

	if err := db.GetDB().WithContext(ctx).Create(&capture).Error; err != nil {
		return model.RawDebugCapture{}, err
	}
	_ = RawDebugAuditRecord(ctx, model.RawDebugAuditEvent{
		SessionID:           session.ID,
		ActorUserID:         session.ActorUserID,
		ActorName:           session.ActorName,
		Action:              model.RawDebugAuditActionCapture,
		TargetType:          "capture",
		TargetID:            strconv.FormatInt(capture.ID, 10),
		Scope:               session.Scope,
		Success:             true,
		CaptureRequestBody:  session.CaptureRequestBody,
		CaptureResponseBody: session.CaptureResponseBody,
		CaptureHeaders:      session.CaptureHeaders,
		RedactAuthHeaders:   session.RedactAuthHeaders,
	})
	return capture, nil
}

func RawDebugCaptureList(ctx context.Context, query model.RawDebugCaptureListQuery) (model.RawDebugCaptureListResult, error) {
	query = normalizeRawDebugCaptureListQuery(query)
	dbQuery := applyRawDebugCaptureFilters(db.GetDB().WithContext(ctx).Model(&model.RawDebugCapture{}), query)
	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return model.RawDebugCaptureListResult{}, err
	}

	offset := (query.Page - 1) * query.PageSize
	var items []model.RawDebugCapture
	if err := dbQuery.
		Order(rawDebugCreatedAtOrderClause(query.SortOrder)).
		Offset(offset).
		Limit(query.PageSize).
		Find(&items).Error; err != nil {
		return model.RawDebugCaptureListResult{}, err
	}
	for i := range items {
		items[i] = rawDebugCaptureForList(items[i])
	}

	return model.RawDebugCaptureListResult{
		Items:    items,
		Total:    total,
		Page:     query.Page,
		PageSize: query.PageSize,
		HasMore:  int64(offset+len(items)) < total,
	}, nil
}

func RawDebugCaptureGet(ctx context.Context, id int64, actorUserID int, actorName string) (model.RawDebugCapture, error) {
	return rawDebugCaptureGetWithAudit(ctx, id, actorUserID, actorName, model.RawDebugAuditActionAccess)
}

func RawDebugCaptureExport(ctx context.Context, id int64, actorUserID int, actorName string) (model.RawDebugCapture, error) {
	return rawDebugCaptureGetWithAudit(ctx, id, actorUserID, actorName, model.RawDebugAuditActionExport)
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

func rawDebugCaptureGetWithAudit(ctx context.Context, id int64, actorUserID int, actorName string, action model.RawDebugAuditAction) (model.RawDebugCapture, error) {
	if id <= 0 {
		return model.RawDebugCapture{}, gorm.ErrRecordNotFound
	}
	var capture model.RawDebugCapture
	if err := db.GetDB().WithContext(ctx).Where("id = ?", id).First(&capture).Error; err != nil {
		return model.RawDebugCapture{}, err
	}
	_ = RawDebugAuditRecord(ctx, model.RawDebugAuditEvent{
		SessionID:   capture.SessionID,
		ActorUserID: actorUserID,
		ActorName:   sanitizeRawDebugText(actorName),
		Action:      action,
		TargetType:  "capture",
		TargetID:    strconv.FormatInt(capture.ID, 10),
		Scope:       capture.TraceID,
		Success:     true,
	})
	return capture, nil
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

func normalizeRawDebugCaptureListQuery(query model.RawDebugCaptureListQuery) model.RawDebugCaptureListQuery {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 || query.PageSize > 100 {
		query.PageSize = 20
	}
	query.TraceID = strings.TrimSpace(query.TraceID)
	query.Model = strings.TrimSpace(query.Model)
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

func applyRawDebugCaptureFilters(query *gorm.DB, filter model.RawDebugCaptureListQuery) *gorm.DB {
	if filter.SessionID > 0 {
		query = query.Where("session_id = ?", filter.SessionID)
	}
	if filter.TraceID != "" {
		query = query.Where("trace_id LIKE ?", rawDebugLike(filter.TraceID))
	}
	if filter.RelayLogID > 0 {
		query = query.Where("relay_log_id = ?", filter.RelayLogID)
	}
	if filter.Model != "" {
		like := rawDebugLike(filter.Model)
		query = query.Where("request_model_name LIKE ? OR actual_model_name LIKE ?", like, like)
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

func rawDebugCaptureForList(capture model.RawDebugCapture) model.RawDebugCapture {
	capture.RequestHeaders = ""
	capture.ResponseHeaders = ""
	capture.RequestBody = ""
	capture.ResponseBody = ""
	return capture
}

func rawDebugCaptureCleanup(ctx context.Context) error {
	cfg := RawDebugConfigFromSettings()
	if cfg.RetentionMinutes <= 0 {
		return nil
	}
	cutoff := time.Now().Add(-time.Duration(cfg.RetentionMinutes) * time.Minute).Unix()
	return db.GetDB().WithContext(ctx).Where("created_at < ?", cutoff).Delete(&model.RawDebugCapture{}).Error
}

func sanitizeRawDebugBytes(data []byte, maxBytes int) (string, bool) {
	if len(data) == 0 {
		return "", false
	}
	if maxBytes <= 0 {
		maxBytes = model.RawDebugDefaultMaxCaptureBytes
	}
	truncated := false
	if len(data) > maxBytes {
		data = data[:maxBytes]
		truncated = true
	}
	return sanitizeRelayLogContent(string(data)), truncated
}

func marshalRawDebugHeaders(headers map[string][]string, redactAuthHeaders bool) string {
	if len(headers) == 0 {
		return ""
	}
	out := make(map[string][]string, len(headers))
	for key, values := range headers {
		cleanKey := strings.TrimSpace(key)
		if cleanKey == "" {
			continue
		}
		if redactAuthHeaders && isSensitiveRelayLogKey(cleanKey) {
			out[cleanKey] = []string{"[REDACTED]"}
			continue
		}
		cleanValues := make([]string, 0, len(values))
		for _, value := range values {
			cleanValues = append(cleanValues, sanitizeRawDebugText(value))
		}
		out[cleanKey] = cleanValues
	}
	data, err := json.Marshal(out)
	if err != nil {
		return ""
	}
	return string(data)
}

func rawDebugFinalHTTPStatus(relayLog model.RelayLog) int {
	for i := len(relayLog.Attempts) - 1; i >= 0; i-- {
		if relayLog.Attempts[i].HTTPStatus > 0 {
			return relayLog.Attempts[i].HTTPStatus
		}
	}
	return 0
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
