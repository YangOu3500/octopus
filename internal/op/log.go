package op

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/utils/log"
	"github.com/bestruirui/octopus/internal/utils/snowflake"
	"gorm.io/gorm"
)

const relayLogMaxSize = 20
const relayLogMaxSizeNoDB = 100 // 当不保存到数据库时，允许更大的缓存用于实时查询

var (
	relayLogBearerPattern = regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._~+/=-]+`)
	relayLogAPIKeyPattern = regexp.MustCompile(`(?i)\bsk-[A-Za-z0-9._-]{8,}`)
	relayLogHeaderPattern = regexp.MustCompile(`(?i)(authorization|cookie|set-cookie|x-api-key|x-goog-api-key)\s*[:=]\s*[^\r\n,;]+`)
)

var relayLogCache = make([]model.RelayLog, 0, relayLogMaxSize)
var relayLogCacheLock sync.Mutex

var relayLogFlushLock sync.Mutex

var relayLogSubscribers = make(map[chan model.RelayLog]struct{})
var relayLogSubscribersLock sync.RWMutex

var relayLogStreamTokens = make(map[string]struct{})
var relayLogStreamTokensLock sync.RWMutex

func RelayLogStreamTokenCreate() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	token := hex.EncodeToString(bytes)

	relayLogStreamTokensLock.Lock()
	relayLogStreamTokens[token] = struct{}{}
	relayLogStreamTokensLock.Unlock()

	return token, nil
}

func RelayLogStreamTokenVerify(token string) bool {
	relayLogStreamTokensLock.RLock()
	_, ok := relayLogStreamTokens[token]
	relayLogStreamTokensLock.RUnlock()
	return ok
}

func RelayLogStreamTokenRevoke(token string) {
	relayLogStreamTokensLock.Lock()
	delete(relayLogStreamTokens, token)
	relayLogStreamTokensLock.Unlock()
}

func RelayLogSubscribe() chan model.RelayLog {
	ch := make(chan model.RelayLog, 10)
	relayLogSubscribersLock.Lock()
	relayLogSubscribers[ch] = struct{}{}
	relayLogSubscribersLock.Unlock()
	return ch
}

func RelayLogUnsubscribe(ch chan model.RelayLog) {
	relayLogSubscribersLock.Lock()
	delete(relayLogSubscribers, ch)
	relayLogSubscribersLock.Unlock()
	close(ch)
}

func notifySubscribers(relayLog model.RelayLog) {
	relayLogSubscribersLock.RLock()
	defer relayLogSubscribersLock.RUnlock()

	relayLog = relayLogForList(relayLog)
	for ch := range relayLogSubscribers {
		select {
		case ch <- relayLog:
		default:
		}
	}
}

func relayLogFlushToDB(ctx context.Context) error {
	relayLogFlushLock.Lock()
	defer relayLogFlushLock.Unlock()

	relayLogCacheLock.Lock()
	if len(relayLogCache) == 0 {
		relayLogCacheLock.Unlock()
		return nil
	}
	batch := make([]model.RelayLog, len(relayLogCache))
	copy(batch, relayLogCache)
	flushedUpto := len(batch)
	relayLogCacheLock.Unlock()

	result := db.GetDB().WithContext(ctx).Create(&batch)
	if result.Error != nil {
		return result.Error
	}

	relayLogCacheLock.Lock()
	if len(relayLogCache) >= flushedUpto {
		relayLogCache = relayLogCache[flushedUpto:]
	} else {
		relayLogCache = relayLogCache[:0]
	}
	if len(relayLogCache) == 0 {
		relayLogCache = make([]model.RelayLog, 0, relayLogMaxSize)
	}
	relayLogCacheLock.Unlock()

	return nil
}

func RelayLogAdd(ctx context.Context, relayLog model.RelayLog) error {
	_, err := RelayLogAddWithResult(ctx, relayLog)
	return err
}

func RelayLogAddWithResult(ctx context.Context, relayLog model.RelayLog) (model.RelayLog, error) {
	enabled, err := SettingGetBool(model.SettingKeyRelayLogKeepEnabled)
	if err != nil {
		return model.RelayLog{}, err
	}
	maxSize := relayLogMaxSize
	if !enabled {
		maxSize = relayLogMaxSizeNoDB
	}
	if relayLog.ID == 0 {
		relayLog.ID = snowflake.GenerateID()
	}
	if relayLog.TraceID == "" {
		relayLog.TraceID = "trace_" + strconv.FormatInt(relayLog.ID, 10)
	}
	if enabled {
		if err := requestTraceMirrorPersist(ctx, relayLog); err != nil {
			return relayLog, err
		}
	}
	go notifySubscribers(relayLog)

	relayLogCacheLock.Lock()
	relayLogCache = append(relayLogCache, relayLog)
	if len(relayLogCache) >= maxSize {
		if enabled {
			relayLogCacheLock.Unlock()
			return relayLog, relayLogFlushToDB(ctx)
		}
		// 如果未启用日志保存，移除最旧的日志，保留最新的日志用于实时查询
		keepSize := maxSize / 2
		if len(relayLogCache) > keepSize {
			relayLogCache = relayLogCache[len(relayLogCache)-keepSize:]
		}
	}
	relayLogCacheLock.Unlock()
	return relayLog, nil
}

func requestTraceMirrorPersist(ctx context.Context, relayLog model.RelayLog) error {
	trace := requestTraceFromRelayLog(relayLog)
	attempts := requestAttemptsFromRelayLog(relayLog, trace.CreatedAt)

	return db.GetDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&trace).Error; err != nil {
			return err
		}
		if err := tx.Where("relay_log_id = ?", relayLog.ID).Delete(&model.RequestAttempt{}).Error; err != nil {
			return err
		}
		if len(attempts) == 0 {
			return nil
		}
		return tx.Create(&attempts).Error
	})
}

func requestTraceFromRelayLog(relayLog model.RelayLog) model.RequestTrace {
	createdAt := relayLog.Time
	if createdAt == 0 {
		createdAt = time.Now().Unix()
	}

	attemptsCount := relayLog.AttemptsCount
	if attemptsCount == 0 {
		attemptsCount = relayLog.TotalAttempts
	}
	if attemptsCount == 0 {
		attemptsCount = len(relayLog.Attempts)
	}

	totalLatencyMS := relayLog.TotalLatencyMS
	if totalLatencyMS == 0 {
		totalLatencyMS = relayLog.UseTime
	}

	finalChannelID := relayLog.FinalChannelID
	if finalChannelID == 0 {
		finalChannelID = relayLog.ChannelId
	}

	finalUpstreamModel := relayLog.FinalUpstreamModel
	if finalUpstreamModel == "" {
		finalUpstreamModel = relayLog.ActualModelName
	}

	trace := model.RequestTrace{
		ID:                 relayLog.ID,
		TraceID:            relayLog.TraceID,
		RelayLogID:         relayLog.ID,
		ThreadID:           relayLog.ThreadID,
		ClientAPIKeyID:     relayLog.ClientAPIKeyID,
		GroupID:            relayLog.GroupID,
		ClientModel:        relayLog.RequestModelName,
		RequestSource:      relayLog.RequestSource,
		RequestStream:      relayLog.RequestStream,
		ClientIP:           relayLog.ClientIP,
		FinalStatus:        relayLogEffectiveStatus(relayLog),
		FinalChannelID:     finalChannelID,
		FinalSiteID:        relayLog.FinalSiteID,
		FinalUpstreamModel: finalUpstreamModel,
		AttemptsCount:      attemptsCount,
		TotalLatencyMS:     totalLatencyMS,
		InputTokens:        relayLog.InputTokens,
		OutputTokens:       relayLog.OutputTokens,
		CacheTokens:        relayLogCacheTokenTotal(relayLog),
		EstimatedCost:      relayLog.EstimatedCost,
		FinalSuccessCost:   relayLog.FinalSuccessCost,
		TotalAttemptCost:   relayLog.TotalAttemptCost,
		FailedAttemptCost:  relayLog.FailedAttemptCost,
		ServiceTier:        relayLog.ServiceTier,
		UsedWS:             relayLog.UsedWS,
		CreatedAt:          createdAt,
	}
	if relayLog.WSMode != nil {
		trace.WSMode = string(*relayLog.WSMode)
	}
	if relayLog.WSRecovery != nil {
		trace.WSRecovery = string(*relayLog.WSRecovery)
	}
	return trace
}

func requestAttemptsFromRelayLog(relayLog model.RelayLog, fallbackCreatedAt int64) []model.RequestAttempt {
	if len(relayLog.Attempts) == 0 {
		return nil
	}
	attempts := make([]model.RequestAttempt, 0, len(relayLog.Attempts))
	for i, attempt := range relayLog.Attempts {
		createdAt := attempt.CreatedAt
		if createdAt == 0 {
			createdAt = fallbackCreatedAt
		}
		attemptIndex := attempt.AttemptIndex
		if attemptIndex == 0 {
			attemptIndex = i + 1
		}
		attemptNum := attempt.AttemptNum
		if attemptNum == 0 {
			attemptNum = i + 1
		}
		durationMS := attempt.DurationMS
		if durationMS == 0 {
			durationMS = attempt.Duration
		}
		totalMS := attempt.TotalMS
		if totalMS == 0 {
			totalMS = durationMS
		}
		attempts = append(attempts, model.RequestAttempt{
			ID:               snowflake.GenerateID(),
			TraceID:          relayLog.TraceID,
			RelayLogID:       relayLog.ID,
			AttemptIndex:     attemptIndex,
			AttemptNum:       attemptNum,
			ChannelID:        attempt.ChannelID,
			ChannelKeyID:     attempt.ChannelKeyID,
			KeyID:            attempt.KeyID,
			ChannelName:      attempt.ChannelName,
			SiteID:           attempt.SiteID,
			SiteAccountID:    attempt.SiteAccountID,
			AccountID:        attempt.AccountID,
			BaseURL:          sanitizeRelayLogURL(attempt.BaseURL),
			ModelName:        attempt.ModelName,
			UpstreamModel:    attempt.UpstreamModel,
			RequestProtocol:  attempt.RequestProtocol,
			UpstreamProtocol: attempt.UpstreamProtocol,
			ResponseProtocol: attempt.ResponseProtocol,
			Status:           attempt.Status,
			HTTPStatus:       attempt.HTTPStatus,
			FailureReason:    sanitizeRelayLogText(attempt.FailureReason),
			Retryable:        attempt.Retryable,
			DurationMS:       durationMS,
			TTFBMS:           attempt.TTFBMS,
			TotalMS:          totalMS,
			InputTokens:      attempt.InputTokens,
			OutputTokens:     attempt.OutputTokens,
			CacheTokens:      attempt.CacheTokens,
			InputCost:        attempt.InputCost,
			OutputCost:       attempt.OutputCost,
			EstimatedCost:    attempt.EstimatedCost,
			CostIncurred:     attempt.CostIncurred,
			CostSource:       attempt.CostSource,
			ServiceTier:      attempt.ServiceTier,
			ErrorSummary:     sanitizeRelayLogText(attempt.ErrorSummary),
			Sticky:           attempt.Sticky,
			CreatedAt:        createdAt,
		})
	}
	return attempts
}

func relayLogEffectiveStatus(relayLog model.RelayLog) string {
	status := strings.ToLower(strings.TrimSpace(relayLog.FinalStatus))
	if status != "" {
		return status
	}
	if strings.TrimSpace(relayLog.Error) != "" {
		return "failed"
	}
	return "success"
}

func RelayLogSaveDBTask(ctx context.Context) error {
	log.Debugf("relay log save db task started")
	startTime := time.Now()
	defer func() {
		log.Debugf("relay log save db task finished, save time: %s", time.Since(startTime))
	}()
	enabled, err := SettingGetBool(model.SettingKeyRelayLogKeepEnabled)
	if err != nil {
		return err
	}

	if enabled {
		if err := relayLogFlushToDB(ctx); err != nil {
			return err
		}
		return relayLogCleanup(ctx)
	}

	// 如果未启用日志保存，检查缓存大小，如果超过限制则清理旧日志
	relayLogCacheLock.Lock()
	if len(relayLogCache) > relayLogMaxSizeNoDB {
		keepSize := relayLogMaxSizeNoDB / 2
		relayLogCache = relayLogCache[len(relayLogCache)-keepSize:]
	}
	relayLogCacheLock.Unlock()

	return nil
}

func relayLogCleanup(ctx context.Context) error {
	keepPeriod, err := SettingGetInt(model.SettingKeyRelayLogKeepPeriod)
	if err != nil {
		return err
	}

	if keepPeriod <= 0 {
		return nil
	}

	cutoffTime := time.Now().Add(-time.Duration(keepPeriod) * 24 * time.Hour).Unix()
	return db.GetDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("created_at < ?", cutoffTime).Delete(&model.RequestAttempt{}).Error; err != nil {
			return err
		}
		if err := tx.Where("created_at < ?", cutoffTime).Delete(&model.RequestTrace{}).Error; err != nil {
			return err
		}
		return tx.Where("time < ?", cutoffTime).Delete(&model.RelayLog{}).Error
	})
}

// RelayLogList 查询日志列表，支持可选的时间范围和渠道ID过滤
// startTime 和 endTime 为 nil 时表示不限制时间范围
// channelIDs 为 nil 或空时表示不限制渠道
func RelayLogList(ctx context.Context, startTime, endTime *int, channelIDs []int, page, pageSize int) ([]model.RelayLog, error) {
	result, err := RelayLogListWithQuery(ctx, model.RelayLogListQuery{
		StartTime:   startTime,
		EndTime:     endTime,
		ChannelIDs:  channelIDs,
		Page:        page,
		PageSize:    pageSize,
		IncludeBody: true,
	})
	if err != nil {
		return nil, err
	}
	return result.Items, nil
}

func RelayLogListWithQuery(ctx context.Context, query model.RelayLogListQuery) (model.RelayLogListResult, error) {
	query = normalizeRelayLogListQuery(query)
	filtered, err := relayLogCollect(ctx, query)
	if err != nil {
		return model.RelayLogListResult{}, err
	}

	total := len(filtered)
	offset := (query.Page - 1) * query.PageSize
	if offset > total {
		offset = total
	}
	end := offset + query.PageSize
	if end > total {
		end = total
	}

	items := make([]model.RelayLog, end-offset)
	copy(items, filtered[offset:end])
	if !query.IncludeBody {
		for i := range items {
			items[i] = relayLogForList(items[i])
		}
	}

	return model.RelayLogListResult{
		Items:    items,
		Total:    total,
		Page:     query.Page,
		PageSize: query.PageSize,
		HasMore:  end < total,
	}, nil
}

func RelayLogCollectWithQuery(ctx context.Context, query model.RelayLogListQuery) ([]model.RelayLog, error) {
	query = normalizeRelayLogListQuery(query)
	logs, err := relayLogCollect(ctx, query)
	if err != nil {
		return nil, err
	}
	for i := range logs {
		logs[i] = relayLogForList(logs[i])
	}
	return logs, nil
}

func relayLogCollect(ctx context.Context, query model.RelayLogListQuery) ([]model.RelayLog, error) {
	enabled, err := SettingGetBool(model.SettingKeyRelayLogKeepEnabled)
	if err != nil {
		return nil, err
	}

	relayLogCacheLock.Lock()
	cachedLogs := make([]model.RelayLog, len(relayLogCache))
	copy(cachedLogs, relayLogCache)
	relayLogCacheLock.Unlock()

	allLogs := make([]model.RelayLog, 0, len(cachedLogs))
	seen := make(map[int64]struct{}, len(cachedLogs))
	for _, relayLog := range cachedLogs {
		allLogs = append(allLogs, relayLog)
		if relayLog.ID != 0 {
			seen[relayLog.ID] = struct{}{}
		}
	}

	if enabled {
		dbQuery := applyRelayLogBroadFilters(db.GetDB().WithContext(ctx).Model(&model.RelayLog{}), query)
		var dbLogs []model.RelayLog
		if err := dbQuery.Order("id DESC").Find(&dbLogs).Error; err != nil {
			return nil, err
		}
		for _, relayLog := range dbLogs {
			if relayLog.ID != 0 {
				if _, ok := seen[relayLog.ID]; ok {
					continue
				}
				seen[relayLog.ID] = struct{}{}
			}
			allLogs = append(allLogs, relayLog)
		}
	}

	filtered := make([]model.RelayLog, 0, len(allLogs))
	for _, relayLog := range allLogs {
		if relayLogMatchesQuery(relayLog, query) {
			filtered = append(filtered, relayLog)
		}
	}
	sortRelayLogs(filtered, query.SortBy, query.SortOrder)
	return filtered, nil
}

func RelayLogListLegacy(ctx context.Context, startTime, endTime *int, channelIDs []int, page, pageSize int) ([]model.RelayLog, error) {
	enabled, err := SettingGetBool(model.SettingKeyRelayLogKeepEnabled)
	if err != nil {
		return nil, err
	}
	hasTimeFilter := startTime != nil && endTime != nil
	hasChannelFilter := len(channelIDs) > 0

	var channelSet map[int]struct{}
	if hasChannelFilter {
		channelSet = make(map[int]struct{}, len(channelIDs))
		for _, id := range channelIDs {
			channelSet[id] = struct{}{}
		}
	}

	// 获取缓存中符合条件的日志
	relayLogCacheLock.Lock()
	var cachedLogs []model.RelayLog
	for _, log := range relayLogCache {
		if hasTimeFilter {
			if log.Time < int64(*startTime) || log.Time > int64(*endTime) {
				continue
			}
		}
		if hasChannelFilter && !logMatchesChannels(log, channelSet) {
			continue
		}
		cachedLogs = append(cachedLogs, log)
	}
	relayLogCacheLock.Unlock()

	// 反转缓存日志顺序（原本新的在末尾，反转后新的在前面，方便分页）
	for i, j := 0, len(cachedLogs)-1; i < j; i, j = i+1, j-1 {
		cachedLogs[i], cachedLogs[j] = cachedLogs[j], cachedLogs[i]
	}

	cacheCount := len(cachedLogs)
	offset := (page - 1) * pageSize

	var result []model.RelayLog

	// 先从缓存中取（缓存是最新的日志）
	if offset < cacheCount {
		cacheEnd := offset + pageSize
		if cacheEnd > cacheCount {
			cacheEnd = cacheCount
		}
		result = append(result, cachedLogs[offset:cacheEnd]...)
	}

	// 如果启用了日志保存，缓存不够时从数据库补充
	if enabled {
		remaining := pageSize - len(result)
		if remaining > 0 {
			dbOffset := 0
			if offset > cacheCount {
				dbOffset = offset - cacheCount
			}

			query := db.GetDB().WithContext(ctx)
			if hasTimeFilter {
				query = query.Where("time >= ? AND time <= ?", *startTime, *endTime)
			}
			if hasChannelFilter {
				query = query.Where("channel_id IN ?", channelIDs)
			}

			var dbLogs []model.RelayLog
			if err := query.Order("id DESC").Offset(dbOffset).Limit(remaining).Find(&dbLogs).Error; err != nil {
				return nil, err
			}
			result = append(result, dbLogs...)
		}
	}

	return result, nil
}

func RelayLogGet(ctx context.Context, id int64) (model.RelayLog, error) {
	if id <= 0 {
		return model.RelayLog{}, gorm.ErrRecordNotFound
	}

	relayLogCacheLock.Lock()
	for i := len(relayLogCache) - 1; i >= 0; i-- {
		if relayLogCache[i].ID == id {
			relayLog := relayLogForDetail(relayLogCache[i])
			relayLogCacheLock.Unlock()
			return relayLog, nil
		}
	}
	relayLogCacheLock.Unlock()

	enabled, err := SettingGetBool(model.SettingKeyRelayLogKeepEnabled)
	if err != nil {
		return model.RelayLog{}, err
	}
	if !enabled {
		return model.RelayLog{}, gorm.ErrRecordNotFound
	}

	var relayLog model.RelayLog
	err = db.GetDB().WithContext(ctx).Where("id = ?", id).First(&relayLog).Error
	if err != nil {
		return model.RelayLog{}, err
	}
	return relayLogForDetail(relayLog), nil
}

func RelayLogIsNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}

func RequestTraceGetByTraceID(ctx context.Context, traceID string) (model.RequestTrace, error) {
	traceID = strings.TrimSpace(traceID)
	if traceID == "" {
		return model.RequestTrace{}, gorm.ErrRecordNotFound
	}

	query := db.GetDB().WithContext(ctx).Model(&model.RequestTrace{})
	if id, err := strconv.ParseInt(traceID, 10, 64); err == nil {
		query = query.Where("trace_id = ? OR relay_log_id = ? OR id = ?", traceID, id, id)
	} else {
		query = query.Where("trace_id = ?", traceID)
	}

	var trace model.RequestTrace
	if err := query.Order("id DESC").First(&trace).Error; err != nil {
		return model.RequestTrace{}, err
	}
	return trace, nil
}

func RequestAttemptsByTraceID(ctx context.Context, traceID string) ([]model.RequestAttempt, error) {
	traceID = strings.TrimSpace(traceID)
	if traceID == "" {
		return nil, nil
	}

	query := db.GetDB().WithContext(ctx).Model(&model.RequestAttempt{})
	if id, err := strconv.ParseInt(traceID, 10, 64); err == nil {
		query = query.Where("trace_id = ? OR relay_log_id = ?", traceID, id)
	} else {
		query = query.Where("trace_id = ?", traceID)
	}

	var attempts []model.RequestAttempt
	if err := query.Order("attempt_index ASC, attempt_num ASC, id ASC").Find(&attempts).Error; err != nil {
		return nil, err
	}
	return attempts, nil
}

func RequestTraceDetailByTraceID(ctx context.Context, traceID string) (model.RequestTraceDetail, error) {
	trace, err := RequestTraceGetByTraceID(ctx, traceID)
	if err != nil {
		return model.RequestTraceDetail{}, err
	}
	attempts, err := RequestAttemptsByTraceID(ctx, trace.TraceID)
	if err != nil {
		return model.RequestTraceDetail{}, err
	}
	return model.RequestTraceDetail{
		Trace:    trace,
		Attempts: attempts,
	}, nil
}

func RequestTraceList(ctx context.Context, query model.RequestTraceListQuery) (model.RequestTraceListResult, error) {
	query = normalizeRequestTraceListQuery(query)
	dbQuery := applyRequestTraceFilters(db.GetDB().WithContext(ctx).Model(&model.RequestTrace{}), query)

	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return model.RequestTraceListResult{}, err
	}

	var items []model.RequestTrace
	offset := (query.Page - 1) * query.PageSize
	if err := dbQuery.
		Order(requestTraceOrderClause(query.SortBy, query.SortOrder)).
		Offset(offset).
		Limit(query.PageSize).
		Find(&items).Error; err != nil {
		return model.RequestTraceListResult{}, err
	}

	return model.RequestTraceListResult{
		Items:    items,
		Total:    total,
		Page:     query.Page,
		PageSize: query.PageSize,
		HasMore:  int64(offset+len(items)) < total,
	}, nil
}

func normalizeRequestTraceListQuery(query model.RequestTraceListQuery) model.RequestTraceListQuery {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 || query.PageSize > 100 {
		query.PageSize = 20
	}
	query.TimeRange = strings.ToLower(strings.TrimSpace(query.TimeRange))
	query.Model = strings.TrimSpace(query.Model)
	query.TraceID = strings.TrimSpace(query.TraceID)
	query.Status = strings.ToLower(strings.TrimSpace(query.Status))
	query.HTTPStatus = strings.ToLower(strings.TrimSpace(query.HTTPStatus))
	query.FailureReason = strings.TrimSpace(query.FailureReason)
	query.Protocol = strings.ToLower(strings.TrimSpace(query.Protocol))
	query.Source = strings.ToLower(strings.TrimSpace(query.Source))
	query.SortBy = strings.ToLower(strings.TrimSpace(query.SortBy))
	query.SortOrder = strings.ToLower(strings.TrimSpace(query.SortOrder))
	if query.SortOrder != "asc" {
		query.SortOrder = "desc"
	}
	switch query.SortBy {
	case "time", "created_at", "duration", "cost", "tokens", "attempts":
	default:
		query.SortBy = "time"
	}
	if query.StartTime == nil && query.EndTime == nil {
		applyRequestTraceTimeRange(&query)
	}
	return query
}

func applyRequestTraceTimeRange(query *model.RequestTraceListQuery) {
	var seconds int
	switch query.TimeRange {
	case "1h":
		seconds = 3600
	case "24h":
		seconds = 24 * 3600
	case "7d":
		seconds = 7 * 24 * 3600
	case "30d":
		seconds = 30 * 24 * 3600
	default:
		return
	}
	end := int(time.Now().Unix())
	start := end - seconds
	query.StartTime = &start
	query.EndTime = &end
}

func applyRequestTraceFilters(query *gorm.DB, filter model.RequestTraceListQuery) *gorm.DB {
	if filter.StartTime != nil {
		query = query.Where("created_at >= ?", *filter.StartTime)
	}
	if filter.EndTime != nil {
		query = query.Where("created_at <= ?", *filter.EndTime)
	}
	if filter.TraceID != "" {
		query = applyRequestTraceIDFilter(query, filter.TraceID)
	}
	if filter.Model != "" {
		like := requestTraceLike(filter.Model)
		attempts := db.GetDB().Model(&model.RequestAttempt{}).
			Select("relay_log_id").
			Where("model_name LIKE ? OR upstream_model LIKE ?", like, like)
		query = query.Where(
			"client_model LIKE ? OR final_upstream_model LIKE ? OR trace_id LIKE ? OR relay_log_id IN (?)",
			like,
			like,
			like,
			attempts,
		)
	}
	if filter.APIKeyID != nil {
		query = query.Where("client_api_key_id = ?", *filter.APIKeyID)
	}
	if filter.Status != "" {
		query = query.Where("final_status = ?", filter.Status)
	}
	if filter.Stream != nil {
		query = query.Where("request_stream = ?", *filter.Stream)
	}
	if filter.Source != "" {
		query = query.Where("request_source = ?", filter.Source)
	}
	if len(filter.ChannelIDs) > 0 {
		attempts := db.GetDB().Model(&model.RequestAttempt{}).
			Select("relay_log_id").
			Where("channel_id IN ?", filter.ChannelIDs)
		query = query.Where("final_channel_id IN ? OR relay_log_id IN (?)", filter.ChannelIDs, attempts)
	}
	if filter.HTTPStatus != "" {
		query = applyRequestTraceHTTPStatusFilter(query, filter.HTTPStatus)
	}
	if filter.FailureReason != "" {
		like := requestTraceLike(filter.FailureReason)
		attempts := db.GetDB().Model(&model.RequestAttempt{}).
			Select("relay_log_id").
			Where("failure_reason LIKE ? OR error_summary LIKE ?", like, like)
		query = query.Where("relay_log_id IN (?)", attempts)
	}
	if filter.Protocol != "" {
		like := requestTraceLike(filter.Protocol)
		attempts := db.GetDB().Model(&model.RequestAttempt{}).
			Select("relay_log_id").
			Where("request_protocol LIKE ? OR upstream_protocol LIKE ? OR response_protocol LIKE ?", like, like, like)
		query = query.Where("relay_log_id IN (?)", attempts)
	}
	if filter.Failover != nil {
		if *filter.Failover {
			query = query.Where("attempts_count > ?", 1)
		} else {
			query = query.Where("attempts_count <= ?", 1)
		}
	}
	return query
}

func applyRequestTraceIDFilter(query *gorm.DB, traceID string) *gorm.DB {
	like := requestTraceLike(traceID)
	if id, err := strconv.ParseInt(traceID, 10, 64); err == nil {
		return query.Where("trace_id LIKE ? OR relay_log_id = ? OR id = ?", like, id, id)
	}
	return query.Where("trace_id LIKE ?", like)
}

func applyRequestTraceHTTPStatusFilter(query *gorm.DB, wanted string) *gorm.DB {
	attempts := db.GetDB().Model(&model.RequestAttempt{}).Select("relay_log_id")
	if strings.HasSuffix(wanted, "xx") && len(wanted) == 3 {
		class, err := strconv.Atoi(wanted[:1])
		if err == nil {
			return query.Where("relay_log_id IN (?)", attempts.Where("http_status >= ? AND http_status <= ?", class*100, class*100+99))
		}
	}
	if strings.Contains(wanted, "-") {
		parts := strings.SplitN(wanted, "-", 2)
		start, startErr := strconv.Atoi(strings.TrimSpace(parts[0]))
		end, endErr := strconv.Atoi(strings.TrimSpace(parts[1]))
		if startErr == nil && endErr == nil {
			return query.Where("relay_log_id IN (?)", attempts.Where("http_status >= ? AND http_status <= ?", start, end))
		}
	}
	code, err := strconv.Atoi(wanted)
	if err != nil {
		return query.Where("1 = 0")
	}
	return query.Where("relay_log_id IN (?)", attempts.Where("http_status = ?", code))
}

func requestTraceLike(value string) string {
	return "%" + strings.TrimSpace(value) + "%"
}

func requestTraceOrderClause(sortBy, sortOrder string) string {
	direction := "DESC"
	if sortOrder == "asc" {
		direction = "ASC"
	}
	switch sortBy {
	case "duration":
		return "total_latency_ms " + direction + ", id " + direction
	case "cost":
		return "total_attempt_cost " + direction + ", estimated_cost " + direction + ", id " + direction
	case "tokens":
		return "(input_tokens + output_tokens + cache_tokens) " + direction + ", id " + direction
	case "attempts":
		return "attempts_count " + direction + ", id " + direction
	case "created_at", "time":
		fallthrough
	default:
		return "created_at " + direction + ", id " + direction
	}
}

// logMatchesChannels 检查日志是否属于指定的渠道集合
// 检查顶层 ChannelId 和 Attempts 中的 ChannelID
func normalizeRelayLogListQuery(query model.RelayLogListQuery) model.RelayLogListQuery {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 || query.PageSize > 100 {
		query.PageSize = 20
	}
	query.TimeRange = strings.ToLower(strings.TrimSpace(query.TimeRange))
	query.Model = strings.TrimSpace(query.Model)
	query.TraceID = strings.TrimSpace(query.TraceID)
	query.APIKey = strings.TrimSpace(query.APIKey)
	query.Status = strings.ToLower(strings.TrimSpace(query.Status))
	query.HTTPStatus = strings.ToLower(strings.TrimSpace(query.HTTPStatus))
	query.FailureReason = strings.TrimSpace(query.FailureReason)
	query.Protocol = strings.ToLower(strings.TrimSpace(query.Protocol))
	query.Source = strings.ToLower(strings.TrimSpace(query.Source))
	query.SortBy = strings.ToLower(strings.TrimSpace(query.SortBy))
	query.SortOrder = strings.ToLower(strings.TrimSpace(query.SortOrder))
	if query.SortOrder != "asc" {
		query.SortOrder = "desc"
	}
	switch query.SortBy {
	case "time", "duration", "ttfb", "cost", "tokens", "attempts":
	default:
		query.SortBy = "time"
	}
	if query.StartTime == nil && query.EndTime == nil {
		applyRelayLogTimeRange(&query)
	}
	return query
}

func applyRelayLogTimeRange(query *model.RelayLogListQuery) {
	var seconds int
	switch query.TimeRange {
	case "1h":
		seconds = 3600
	case "24h":
		seconds = 24 * 3600
	case "7d":
		seconds = 7 * 24 * 3600
	case "30d":
		seconds = 30 * 24 * 3600
	default:
		return
	}
	end := int(time.Now().Unix())
	start := end - seconds
	query.StartTime = &start
	query.EndTime = &end
}

func applyRelayLogBroadFilters(query *gorm.DB, filter model.RelayLogListQuery) *gorm.DB {
	if filter.StartTime != nil {
		query = query.Where("time >= ?", *filter.StartTime)
	}
	if filter.EndTime != nil {
		query = query.Where("time <= ?", *filter.EndTime)
	}
	if filter.TraceID != "" {
		if id, err := strconv.ParseInt(filter.TraceID, 10, 64); err == nil {
			query = query.Where("trace_id = ? OR id = ?", filter.TraceID, id)
		} else {
			query = query.Where("trace_id = ?", filter.TraceID)
		}
	}
	if filter.APIKeyID != nil {
		query = query.Where("client_api_key_id = ?", *filter.APIKeyID)
	}
	if filter.Stream != nil {
		query = query.Where("request_stream = ?", *filter.Stream)
	}
	if filter.Source != "" {
		query = query.Where("request_source = ?", filter.Source)
	}
	return query
}

func relayLogMatchesQuery(relayLog model.RelayLog, query model.RelayLogListQuery) bool {
	if query.StartTime != nil && relayLog.Time < int64(*query.StartTime) {
		return false
	}
	if query.EndTime != nil && relayLog.Time > int64(*query.EndTime) {
		return false
	}
	if len(query.ChannelIDs) > 0 && !logMatchesChannels(relayLog, intSet(query.ChannelIDs)) {
		return false
	}
	if query.Model != "" && !relayLogMatchesModel(relayLog, query.Model) {
		return false
	}
	if query.TraceID != "" && !relayLogMatchesTrace(relayLog, query.TraceID) {
		return false
	}
	if query.APIKeyID != nil && relayLog.ClientAPIKeyID != *query.APIKeyID {
		return false
	}
	if query.APIKey != "" && !relayLogMatchesAPIKey(relayLog, query.APIKey) {
		return false
	}
	if query.Status != "" && !relayLogMatchesStatus(relayLog, query.Status) {
		return false
	}
	if query.HTTPStatus != "" && !relayLogMatchesHTTPStatus(relayLog, query.HTTPStatus) {
		return false
	}
	if query.FailureReason != "" && !relayLogMatchesFailureReason(relayLog, query.FailureReason) {
		return false
	}
	if query.Protocol != "" && !relayLogMatchesProtocol(relayLog, query.Protocol) {
		return false
	}
	if query.Source != "" && !strings.EqualFold(strings.TrimSpace(relayLog.RequestSource), query.Source) {
		return false
	}
	if query.Stream != nil && relayLog.RequestStream != *query.Stream {
		return false
	}
	if query.Failover != nil && relayLogHasFailover(relayLog) != *query.Failover {
		return false
	}
	if query.CacheHit != nil && relayLogHasCacheHit(relayLog) != *query.CacheHit {
		return false
	}
	return true
}

func intSet(values []int) map[int]struct{} {
	set := make(map[int]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	return set
}

func relayLogMatchesModel(relayLog model.RelayLog, needle string) bool {
	if textContains(relayLog.RequestModelName, needle) ||
		textContains(relayLog.ActualModelName, needle) ||
		textContains(relayLog.FinalUpstreamModel, needle) {
		return true
	}
	for _, attempt := range relayLog.Attempts {
		if textContains(attempt.ModelName, needle) || textContains(attempt.UpstreamModel, needle) {
			return true
		}
	}
	return false
}

func relayLogMatchesTrace(relayLog model.RelayLog, traceID string) bool {
	if strings.EqualFold(strings.TrimSpace(relayLog.TraceID), traceID) {
		return true
	}
	return strconv.FormatInt(relayLog.ID, 10) == traceID
}

func relayLogMatchesAPIKey(relayLog model.RelayLog, apiKey string) bool {
	if textContains(relayLog.RequestAPIKeyName, apiKey) {
		return true
	}
	return relayLog.ClientAPIKeyID > 0 && strings.Contains(strconv.Itoa(relayLog.ClientAPIKeyID), apiKey)
}

func relayLogMatchesStatus(relayLog model.RelayLog, status string) bool {
	finalStatus := strings.ToLower(strings.TrimSpace(relayLog.FinalStatus))
	if finalStatus == "" {
		if relayLog.Error != "" {
			finalStatus = "failed"
		} else {
			finalStatus = "success"
		}
	}
	return finalStatus == status
}

func relayLogMatchesHTTPStatus(relayLog model.RelayLog, wanted string) bool {
	for _, attempt := range relayLog.Attempts {
		if httpStatusMatches(attempt.HTTPStatus, wanted) {
			return true
		}
	}
	return false
}

func httpStatusMatches(status int, wanted string) bool {
	if status <= 0 || wanted == "" {
		return false
	}
	if strings.HasSuffix(wanted, "xx") && len(wanted) == 3 {
		class, err := strconv.Atoi(wanted[:1])
		return err == nil && status/100 == class
	}
	if strings.Contains(wanted, "-") {
		parts := strings.SplitN(wanted, "-", 2)
		start, startErr := strconv.Atoi(strings.TrimSpace(parts[0]))
		end, endErr := strconv.Atoi(strings.TrimSpace(parts[1]))
		return startErr == nil && endErr == nil && status >= start && status <= end
	}
	code, err := strconv.Atoi(wanted)
	return err == nil && status == code
}

func relayLogMatchesFailureReason(relayLog model.RelayLog, needle string) bool {
	if textContains(relayLog.Error, needle) {
		return true
	}
	for _, attempt := range relayLog.Attempts {
		if textContains(attempt.FailureReason, needle) ||
			textContains(attempt.ErrorSummary, needle) ||
			textContains(attempt.Msg, needle) {
			return true
		}
	}
	return false
}

func relayLogMatchesProtocol(relayLog model.RelayLog, protocol string) bool {
	if relayLog.UsedWS && textContains("websocket ws", protocol) {
		return true
	}
	for _, attempt := range relayLog.Attempts {
		if textContains(attempt.RequestProtocol, protocol) ||
			textContains(attempt.UpstreamProtocol, protocol) ||
			textContains(attempt.ResponseProtocol, protocol) {
			return true
		}
	}
	return false
}

func relayLogHasFailover(relayLog model.RelayLog) bool {
	channelIDs := make(map[int]struct{})
	for _, attempt := range relayLog.Attempts {
		if attempt.ChannelID == 0 {
			continue
		}
		channelIDs[attempt.ChannelID] = struct{}{}
		if len(channelIDs) > 1 {
			return true
		}
	}
	return len(relayLog.Attempts) == 0 && (relayLog.AttemptsCount > 1 || relayLog.TotalAttempts > 1)
}

func relayLogHasCacheHit(relayLog model.RelayLog) bool {
	return relayLog.CacheTokens > 0 ||
		(relayLog.CacheReadTokens != nil && *relayLog.CacheReadTokens > 0) ||
		(relayLog.CacheWriteTokens != nil && *relayLog.CacheWriteTokens > 0)
}

func relayLogForList(relayLog model.RelayLog) model.RelayLog {
	relayLog.RequestContent = ""
	relayLog.ResponseContent = ""
	return relayLog
}

func relayLogForDetail(relayLog model.RelayLog) model.RelayLog {
	relayLog.RequestContent = sanitizeRelayLogContent(relayLog.RequestContent)
	relayLog.ResponseContent = sanitizeRelayLogContent(relayLog.ResponseContent)
	relayLog.Error = sanitizeRelayLogText(relayLog.Error)
	for i := range relayLog.Attempts {
		relayLog.Attempts[i].FailureReason = sanitizeRelayLogText(relayLog.Attempts[i].FailureReason)
		relayLog.Attempts[i].ErrorSummary = sanitizeRelayLogText(relayLog.Attempts[i].ErrorSummary)
		relayLog.Attempts[i].Msg = sanitizeRelayLogText(relayLog.Attempts[i].Msg)
	}
	return relayLog
}

func sanitizeRelayLogContent(content string) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}

	var value any
	if err := json.Unmarshal([]byte(content), &value); err == nil {
		sanitized := sanitizeRelayLogJSONValue(value)
		if out, marshalErr := json.Marshal(sanitized); marshalErr == nil {
			return string(out)
		}
	}
	return sanitizeRelayLogText(content)
}

func sanitizeRelayLogURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	parsed, err := url.Parse(value)
	if err == nil && parsed.Scheme != "" && parsed.Host != "" {
		parsed.User = nil
		parsed.RawQuery = ""
		parsed.Fragment = ""
		return sanitizeRelayLogText(parsed.String())
	}
	return sanitizeRelayLogText(value)
}

func sanitizeRelayLogJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, child := range typed {
			if isSensitiveRelayLogKey(key) {
				out[key] = "[REDACTED]"
				continue
			}
			out[key] = sanitizeRelayLogJSONValue(child)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, child := range typed {
			out[i] = sanitizeRelayLogJSONValue(child)
		}
		return out
	case string:
		return sanitizeRelayLogText(typed)
	default:
		return value
	}
}

func isSensitiveRelayLogKey(key string) bool {
	normalized := strings.NewReplacer("-", "", "_", "", ".", "").Replace(strings.ToLower(strings.TrimSpace(key)))
	switch normalized {
	case "authorization", "cookie", "setcookie", "xapikey", "xgoogapikey", "apikey", "accesstoken", "refreshtoken", "session", "jwt":
		return true
	default:
		return false
	}
}

func sanitizeRelayLogText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = relayLogHeaderPattern.ReplaceAllString(value, "$1: [REDACTED]")
	value = relayLogBearerPattern.ReplaceAllString(value, "Bearer [REDACTED]")
	value = relayLogAPIKeyPattern.ReplaceAllString(value, "sk-[REDACTED]")
	if len(value) > 32*1024 {
		value = value[:32*1024]
	}
	return value
}

func textContains(text, needle string) bool {
	return strings.Contains(strings.ToLower(text), strings.ToLower(strings.TrimSpace(needle)))
}

func sortRelayLogs(logs []model.RelayLog, sortBy, sortOrder string) {
	desc := sortOrder != "asc"
	sort.SliceStable(logs, func(i, j int) bool {
		cmp := compareRelayLogs(logs[i], logs[j], sortBy)
		if cmp == 0 {
			if desc {
				return logs[i].ID > logs[j].ID
			}
			return logs[i].ID < logs[j].ID
		}
		if desc {
			return cmp > 0
		}
		return cmp < 0
	})
}

func compareRelayLogs(left, right model.RelayLog, sortBy string) int {
	switch sortBy {
	case "duration":
		return compareInt(relayLogDuration(left), relayLogDuration(right))
	case "ttfb":
		return compareInt(left.Ftut, right.Ftut)
	case "cost":
		return compareFloat(relayLogCost(left), relayLogCost(right))
	case "tokens":
		return compareInt(relayLogTokens(left), relayLogTokens(right))
	case "attempts":
		return compareInt(relayLogAttemptCount(left), relayLogAttemptCount(right))
	case "time":
		fallthrough
	default:
		return compareInt64(left.Time, right.Time)
	}
}

func relayLogDuration(relayLog model.RelayLog) int {
	if relayLog.TotalLatencyMS > 0 {
		return relayLog.TotalLatencyMS
	}
	return relayLog.UseTime
}

func relayLogCost(relayLog model.RelayLog) float64 {
	if relayLog.TotalAttemptCost > 0 {
		return relayLog.TotalAttemptCost
	}
	if relayLog.FinalSuccessCost > 0 {
		return relayLog.FinalSuccessCost
	}
	return relayLog.Cost
}

func relayLogTokens(relayLog model.RelayLog) int {
	return relayLog.InputTokens + relayLog.OutputTokens + relayLog.CacheTokens
}

func relayLogAttemptCount(relayLog model.RelayLog) int {
	if relayLog.AttemptsCount > 0 {
		return relayLog.AttemptsCount
	}
	if relayLog.TotalAttempts > 0 {
		return relayLog.TotalAttempts
	}
	return len(relayLog.Attempts)
}

func compareInt(left, right int) int {
	if left < right {
		return -1
	}
	if left > right {
		return 1
	}
	return 0
}

func compareInt64(left, right int64) int {
	if left < right {
		return -1
	}
	if left > right {
		return 1
	}
	return 0
}

func compareFloat(left, right float64) int {
	if left < right {
		return -1
	}
	if left > right {
		return 1
	}
	return 0
}

func logMatchesChannels(log model.RelayLog, channelSet map[int]struct{}) bool {
	if _, ok := channelSet[log.ChannelId]; ok {
		return true
	}
	for _, attempt := range log.Attempts {
		if _, ok := channelSet[attempt.ChannelID]; ok {
			return true
		}
	}
	return false
}

func RelayLogClear(ctx context.Context) error {
	relayLogCacheLock.Lock()
	relayLogCache = make([]model.RelayLog, 0, relayLogMaxSize)
	relayLogCacheLock.Unlock()
	return db.GetDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1 = 1").Delete(&model.RequestAttempt{}).Error; err != nil {
			return err
		}
		if err := tx.Where("1 = 1").Delete(&model.RequestTrace{}).Error; err != nil {
			return err
		}
		return tx.Where("1 = 1").Delete(&model.RelayLog{}).Error
	})
}
