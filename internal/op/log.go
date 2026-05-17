package op

import (
	"context"
	"crypto/rand"
	"encoding/hex"
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
	enabled, err := SettingGetBool(model.SettingKeyRelayLogKeepEnabled)
	if err != nil {
		return err
	}
	maxSize := relayLogMaxSize
	if !enabled {
		maxSize = relayLogMaxSizeNoDB
	}
	relayLog.ID = snowflake.GenerateID()
	if relayLog.TraceID == "" {
		relayLog.TraceID = "trace_" + strconv.FormatInt(relayLog.ID, 10)
	}
	go notifySubscribers(relayLog)

	relayLogCacheLock.Lock()
	relayLogCache = append(relayLogCache, relayLog)
	if len(relayLogCache) >= maxSize {
		if enabled {
			relayLogCacheLock.Unlock()
			return relayLogFlushToDB(ctx)
		}
		// 如果未启用日志保存，移除最旧的日志，保留最新的日志用于实时查询
		keepSize := maxSize / 2
		if len(relayLogCache) > keepSize {
			relayLogCache = relayLogCache[len(relayLogCache)-keepSize:]
		}
	}
	relayLogCacheLock.Unlock()
	return nil
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
	return db.GetDB().WithContext(ctx).Where("time < ?", cutoffTime).Delete(&model.RelayLog{}).Error
}

// RelayLogList 查询日志列表，支持可选的时间范围和渠道ID过滤
// startTime 和 endTime 为 nil 时表示不限制时间范围
// channelIDs 为 nil 或空时表示不限制渠道
func RelayLogList(ctx context.Context, startTime, endTime *int, channelIDs []int, page, pageSize int) ([]model.RelayLog, error) {
	result, err := RelayLogListWithQuery(ctx, model.RelayLogListQuery{
		StartTime:  startTime,
		EndTime:    endTime,
		ChannelIDs: channelIDs,
		Page:       page,
		PageSize:   pageSize,
	})
	if err != nil {
		return nil, err
	}
	return result.Items, nil
}

func RelayLogListWithQuery(ctx context.Context, query model.RelayLogListQuery) (model.RelayLogListResult, error) {
	query = normalizeRelayLogListQuery(query)
	enabled, err := SettingGetBool(model.SettingKeyRelayLogKeepEnabled)
	if err != nil {
		return model.RelayLogListResult{}, err
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
			return model.RelayLogListResult{}, err
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

	total := len(filtered)
	offset := (query.Page - 1) * query.PageSize
	if offset > total {
		offset = total
	}
	end := offset + query.PageSize
	if end > total {
		end = total
	}

	return model.RelayLogListResult{
		Items:    filtered[offset:end],
		Total:    total,
		Page:     query.Page,
		PageSize: query.PageSize,
		HasMore:  end < total,
	}, nil
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
	return db.GetDB().WithContext(ctx).Where("1 = 1").Delete(&model.RelayLog{}).Error
}
