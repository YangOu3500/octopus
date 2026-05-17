package grouphealth

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/relay/balancer"
)

const channelModelHealthDefaultRange = "24h"

type channelModelHealthAccumulator struct {
	row             model.ChannelModelHealthRow
	ttfbSum         int
	ttfbSamples     int
	totalMSSum      int
	totalMSSamples  int
	durationSeconds float64
}

func BuildChannelModelHealth(ctx context.Context, query model.ChannelModelHealthQuery) (model.ChannelModelHealthResult, error) {
	query = normalizeChannelModelHealthQuery(query)
	logQuery := model.RelayLogListQuery{
		Page:      1,
		PageSize:  100,
		TimeRange: query.TimeRange,
		Model:     query.Model,
		SortBy:    "time",
		SortOrder: "desc",
	}
	if query.ChannelID > 0 {
		logQuery.ChannelIDs = []int{query.ChannelID}
	}
	logs, err := op.RelayLogCollectWithQuery(ctx, logQuery)
	if err != nil {
		return model.ChannelModelHealthResult{}, err
	}

	channels, err := op.ChannelList(ctx)
	if err != nil {
		return model.ChannelModelHealthResult{}, err
	}
	channelByID := make(map[int]model.Channel, len(channels))
	channelIDs := make([]int, 0, len(channels))
	for _, channel := range channels {
		channelByID[channel.ID] = channel
		channelIDs = append(channelIDs, channel.ID)
	}
	bindings, err := op.SiteChannelBindingMapByChannelIDs(channelIDs, ctx)
	if err != nil {
		return model.ChannelModelHealthResult{}, err
	}

	result := model.ChannelModelHealthResult{
		Summary: model.ChannelModelHealthSummary{
			TimeRange:             query.TimeRange,
			HealthScoreEnabled:    balancer.IsHealthSchedulingEnabled(),
			LoadBalancingStrategy: channelModelHealthStrategy(),
		},
	}
	startTime, endTime := channelModelHealthWindow(query.TimeRange, logs)
	result.Summary.StartTime = startTime
	result.Summary.EndTime = endTime

	rows := make(map[string]*channelModelHealthAccumulator)
	if query.Source == "" {
		if err := seedConfiguredChannelModels(ctx, rows, query, channelByID, bindings); err != nil {
			return model.ChannelModelHealthResult{}, err
		}
	}
	for _, relayLog := range logs {
		if query.Source != "" && channelModelHealthSourceName(relayLog.RequestSource) != query.Source {
			continue
		}
		recordChannelModelLog(ctx, rows, query, channelByID, bindings, relayLog)
	}

	out := make([]model.ChannelModelHealthRow, 0, len(rows))
	minutes := channelModelHealthMinutes(result.Summary.StartTime, result.Summary.EndTime)
	for _, acc := range rows {
		if acc == nil {
			continue
		}
		finalizeChannelModelHealthRow(acc, channelByID)
		if acc.row.RequestCount > 0 && minutes > 0 {
			acc.row.RPM = float64(acc.row.RequestCount) / minutes
		}
		if !channelModelRowMatchesQuery(acc.row, query) {
			continue
		}
		out = append(out, acc.row)
	}
	sortChannelModelHealthRows(out)
	result.Rows = out
	result.Summary.TotalRows = len(out)
	for _, row := range out {
		result.Summary.TotalRequests += row.RequestCount
		result.Summary.SuccessCount += row.SuccessCount
		result.Summary.FailureCount += row.FailureCount
		result.Summary.AvgHealthScore += row.HealthScore
		result.Summary.ActiveSelections += row.ActiveSelections
		result.Summary.EstimatedCost += row.EstimatedCost
		if row.CoolingDown {
			result.Summary.CoolingDownCount++
		}
	}
	if result.Summary.TotalRows > 0 {
		result.Summary.AvgHealthScore /= float64(result.Summary.TotalRows)
	}
	if result.Summary.SuccessCount+result.Summary.FailureCount > 0 {
		result.Summary.AvgSuccessRate = float64(result.Summary.SuccessCount) / float64(result.Summary.SuccessCount+result.Summary.FailureCount)
	}
	return result, nil
}

func normalizeChannelModelHealthQuery(query model.ChannelModelHealthQuery) model.ChannelModelHealthQuery {
	query.TimeRange = strings.ToLower(strings.TrimSpace(query.TimeRange))
	if query.TimeRange == "" {
		query.TimeRange = channelModelHealthDefaultRange
	}
	switch query.TimeRange {
	case "1h", "24h", "7d", "30d", "all":
	default:
		query.TimeRange = channelModelHealthDefaultRange
	}
	query.Model = strings.TrimSpace(query.Model)
	query.Source = strings.ToLower(strings.TrimSpace(query.Source))
	if query.Source == "all" {
		query.Source = ""
	}
	return query
}

func channelModelHealthStrategy() string {
	if balancer.IsHealthSchedulingEnabled() {
		return "health_score"
	}
	return "static_group_mode"
}

func seedConfiguredChannelModels(ctx context.Context, rows map[string]*channelModelHealthAccumulator, query model.ChannelModelHealthQuery, channels map[int]model.Channel, bindings map[int]model.SiteChannelBinding) error {
	modelChannels, err := op.ChannelLLMList(ctx)
	if err != nil {
		return err
	}
	for _, item := range modelChannels {
		if query.ChannelID > 0 && item.ChannelID != query.ChannelID {
			continue
		}
		if query.Model != "" && !strings.Contains(strings.ToLower(item.Name), strings.ToLower(query.Model)) {
			continue
		}
		acc := ensureChannelModelRow(rows, item.ChannelID, item.Name)
		acc.row.ChannelName = firstNonEmptyString(item.ChannelName, "channel-"+strconv.Itoa(item.ChannelID))
		if item.SiteID != nil {
			acc.row.Managed = true
			acc.row.SiteID = *item.SiteID
			acc.row.SiteName = item.SiteName
		}
		if item.SiteAccountID != nil {
			acc.row.Managed = true
			acc.row.SiteAccountID = *item.SiteAccountID
			acc.row.SiteAccountName = item.SiteAccountName
		}
		applyChannelModelChannelMetadata(ctx, &acc.row, channels, bindings)
	}
	return nil
}

func recordChannelModelLog(ctx context.Context, rows map[string]*channelModelHealthAccumulator, query model.ChannelModelHealthQuery, channels map[int]model.Channel, bindings map[int]model.SiteChannelBinding, relayLog model.RelayLog) {
	if len(relayLog.Attempts) == 0 {
		channelID := relayLog.ChannelId
		modelName := firstNonEmptyString(relayLog.FinalUpstreamModel, relayLog.ActualModelName, relayLog.RequestModelName)
		if channelID <= 0 || modelName == "" {
			return
		}
		if query.ChannelID > 0 && channelID != query.ChannelID {
			return
		}
		acc := ensureChannelModelRow(rows, channelID, modelName)
		acc.row.ChannelName = firstNonEmptyString(relayLog.ChannelName, acc.row.ChannelName)
		applyChannelModelChannelMetadata(ctx, &acc.row, channels, bindings)
		recordChannelModelSample(acc, relayLogFinalSuccessForHealth(relayLog), relayLog.Ftut, relayLogDurationForHealth(relayLog), relayLog.InputTokens, relayLog.OutputTokens, relayLogCacheTokenTotalForHealth(relayLog), relayLogCostForHealth(relayLog), relayLog.Time, 0, relayLog.Error)
		return
	}

	for _, attempt := range relayLog.Attempts {
		if attempt.Status == model.AttemptSkipped || attempt.ChannelID <= 0 {
			continue
		}
		modelName := firstNonEmptyString(attempt.ModelName, attempt.UpstreamModel, relayLog.FinalUpstreamModel, relayLog.ActualModelName, relayLog.RequestModelName)
		if modelName == "" {
			continue
		}
		if query.ChannelID > 0 && attempt.ChannelID != query.ChannelID {
			continue
		}
		acc := ensureChannelModelRow(rows, attempt.ChannelID, modelName)
		acc.row.ChannelName = firstNonEmptyString(attempt.ChannelName, relayLog.ChannelName, acc.row.ChannelName)
		applyChannelModelChannelMetadata(ctx, &acc.row, channels, bindings)
		success := attempt.Status == model.AttemptSuccess
		inputTokens, outputTokens, cacheTokens := attempt.InputTokens, attempt.OutputTokens, attempt.CacheTokens
		if len(relayLog.Attempts) == 1 {
			if inputTokens == 0 {
				inputTokens = relayLog.InputTokens
			}
			if outputTokens == 0 {
				outputTokens = relayLog.OutputTokens
			}
			if cacheTokens == 0 {
				cacheTokens = relayLogCacheTokenTotalForHealth(relayLog)
			}
		}
		recordChannelModelSample(
			acc,
			success,
			firstPositiveInt(attempt.TTFBMS, relayLog.Ftut),
			firstPositiveInt(attempt.TotalMS, attempt.DurationMS, attempt.Duration),
			inputTokens,
			outputTokens,
			cacheTokens,
			channelAttemptCost(attempt),
			firstPositiveInt64(attempt.CreatedAt, relayLog.Time),
			attempt.HTTPStatus,
			firstNonEmptyString(attempt.FailureReason, attempt.ErrorSummary, attempt.Msg),
		)
	}
}

func ensureChannelModelRow(rows map[string]*channelModelHealthAccumulator, channelID int, modelName string) *channelModelHealthAccumulator {
	modelName = strings.TrimSpace(modelName)
	key := strconv.Itoa(channelID) + "\x00" + strings.ToLower(modelName)
	if acc, ok := rows[key]; ok {
		if acc.row.ModelName == "" {
			acc.row.ModelName = modelName
		}
		return acc
	}
	acc := &channelModelHealthAccumulator{
		row: model.ChannelModelHealthRow{
			ChannelID:   channelID,
			ChannelName: "channel-" + strconv.Itoa(channelID),
			ModelName:   modelName,
			QuotaStatus: "unknown",
		},
	}
	rows[key] = acc
	return acc
}

func recordChannelModelSample(acc *channelModelHealthAccumulator, success bool, ttfbMS, totalMS, inputTokens, outputTokens, cacheTokens int, cost float64, seenAt int64, httpStatus int, failureReason string) {
	if acc == nil {
		return
	}
	acc.row.RequestCount++
	if success {
		acc.row.SuccessCount++
	} else {
		acc.row.FailureCount++
		acc.row.LastFailureReason = failureReason
		acc.row.LastHTTPStatus = httpStatus
	}
	if ttfbMS > 0 {
		acc.ttfbSum += ttfbMS
		acc.ttfbSamples++
	}
	if totalMS > 0 {
		acc.totalMSSum += totalMS
		acc.totalMSSamples++
		acc.durationSeconds += float64(totalMS) / 1000
	}
	acc.row.InputTokens += inputTokens
	acc.row.OutputTokens += outputTokens
	acc.row.CacheTokens += cacheTokens
	acc.row.EstimatedCost += cost
	if seenAt > acc.row.LastSeenTime {
		acc.row.LastSeenTime = seenAt
	}
	if httpStatus > 0 && acc.row.LastHTTPStatus == 0 {
		acc.row.LastHTTPStatus = httpStatus
	}
}

func finalizeChannelModelHealthRow(acc *channelModelHealthAccumulator, channels map[int]model.Channel) {
	if acc == nil {
		return
	}
	row := &acc.row
	if row.SuccessCount+row.FailureCount > 0 {
		row.SuccessRate = float64(row.SuccessCount) / float64(row.SuccessCount+row.FailureCount)
	}
	if acc.ttfbSamples > 0 {
		row.AvgTTFBMS = acc.ttfbSum / acc.ttfbSamples
	}
	if acc.totalMSSamples > 0 {
		row.AvgTotalMS = acc.totalMSSum / acc.totalMSSamples
	}
	if acc.durationSeconds > 0 {
		row.TokensPerSecond = float64(row.OutputTokens) / acc.durationSeconds
	}

	stats := balancer.GetHealthStats(row.ChannelID, row.ModelName)
	row.HealthScore = stats.HealthScore
	row.HealthSampleCount = stats.SampleCount
	row.HealthSuccessCount = stats.SuccessCount
	row.HealthFailureCount = stats.FailureCount
	row.HealthSuccessRate = stats.SuccessRate
	row.EmptyResponseRate = stats.EmptyResponseRate
	row.RateLimitCount = stats.RateLimitCount
	if row.AvgTTFBMS == 0 {
		row.AvgTTFBMS = stats.AvgTTFBMS
	}
	if row.AvgTotalMS == 0 {
		row.AvgTotalMS = stats.AvgTotalMS
	}
	row.ActiveSelections = balancer.ActiveSelectionCount(row.ChannelID, row.ModelName)

	channel, ok := channels[row.ChannelID]
	if ok {
		usedKey := channel.GetChannelKey()
		row.CoolingDown, row.CooldownRemainingMS, row.CooldownReason = channelModelCoolingState(channel.ID, usedKey.ID, row.ModelName, channel.GetBaseUrl())
	}
}

func applyChannelModelChannelMetadata(ctx context.Context, row *model.ChannelModelHealthRow, channels map[int]model.Channel, bindings map[int]model.SiteChannelBinding) {
	if row == nil {
		return
	}
	if channel, ok := channels[row.ChannelID]; ok {
		row.ChannelName = firstNonEmptyString(channel.Name, row.ChannelName)
	}
	binding, ok := bindings[row.ChannelID]
	if !ok {
		if row.QuotaStatus == "" {
			row.QuotaStatus = "unknown"
		}
		return
	}
	row.Managed = true
	row.SiteID = binding.SiteID
	row.SiteAccountID = binding.SiteAccountID
	if site, err := op.SiteGet(binding.SiteID, ctx); err == nil && site != nil {
		row.SiteName = site.Name
	}
	account, err := op.SiteAccountGet(binding.SiteAccountID, ctx)
	if err != nil || account == nil {
		row.QuotaStatus = "unknown"
		return
	}
	row.SiteAccountName = account.Name
	row.QuotaBalance = account.Balance
	row.QuotaUsed = account.BalanceUsed
	if !account.Enabled {
		row.QuotaStatus = "account_disabled"
		return
	}
	if account.Balance > 0 {
		row.QuotaStatus = "available"
		return
	}
	if account.LastSyncAt != nil || account.BalanceUsed > 0 {
		row.QuotaStatus = "zero_balance"
		return
	}
	row.QuotaStatus = "unknown"
}

func channelModelCoolingState(channelID, channelKeyID int, modelName, baseURL string) (bool, int64, string) {
	cooling, remaining, reason := balancer.IsHealthCoolingDown(channelID, channelKeyID, modelName, baseURL)
	if remaining <= 0 {
		return cooling, 0, reason
	}
	return cooling, remaining.Milliseconds(), reason
}

func channelModelRowMatchesQuery(row model.ChannelModelHealthRow, query model.ChannelModelHealthQuery) bool {
	if query.ChannelID > 0 && row.ChannelID != query.ChannelID {
		return false
	}
	if query.Model != "" && !strings.Contains(strings.ToLower(row.ModelName), strings.ToLower(query.Model)) {
		return false
	}
	if query.Source != "" && row.RequestCount == 0 {
		return false
	}
	return true
}

func sortChannelModelHealthRows(rows []model.ChannelModelHealthRow) {
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].CoolingDown != rows[j].CoolingDown {
			return rows[i].CoolingDown
		}
		if rows[i].FailureCount != rows[j].FailureCount {
			return rows[i].FailureCount > rows[j].FailureCount
		}
		if rows[i].HealthScore != rows[j].HealthScore {
			return rows[i].HealthScore < rows[j].HealthScore
		}
		if rows[i].RequestCount != rows[j].RequestCount {
			return rows[i].RequestCount > rows[j].RequestCount
		}
		if rows[i].ChannelName != rows[j].ChannelName {
			return rows[i].ChannelName < rows[j].ChannelName
		}
		return rows[i].ModelName < rows[j].ModelName
	})
}

func channelModelHealthWindow(timeRange string, logs []model.RelayLog) (int64, int64) {
	now := time.Now().Unix()
	switch timeRange {
	case "1h":
		return now - 3600, now
	case "24h":
		return now - 24*3600, now
	case "7d":
		return now - 7*24*3600, now
	case "30d":
		return now - 30*24*3600, now
	}
	if len(logs) == 0 {
		return 0, now
	}
	start := logs[0].Time
	end := logs[0].Time
	for _, relayLog := range logs {
		if relayLog.Time > 0 && (start == 0 || relayLog.Time < start) {
			start = relayLog.Time
		}
		if relayLog.Time > end {
			end = relayLog.Time
		}
	}
	if end <= start {
		end = now
	}
	return start, end
}

func channelModelHealthMinutes(startTime, endTime int64) float64 {
	if startTime <= 0 || endTime <= startTime {
		return 1
	}
	minutes := float64(endTime-startTime) / 60
	if minutes <= 0 {
		return 1
	}
	return minutes
}

func channelModelHealthSourceName(source string) string {
	source = strings.ToLower(strings.TrimSpace(source))
	if source == "" {
		return "relay"
	}
	return source
}

func channelAttemptCost(attempt model.ChannelAttempt) float64 {
	if attempt.EstimatedCost > 0 {
		return attempt.EstimatedCost
	}
	return attempt.InputCost + attempt.OutputCost
}

func relayLogFinalSuccessForHealth(relayLog model.RelayLog) bool {
	status := strings.ToLower(strings.TrimSpace(relayLog.FinalStatus))
	if status == "" {
		return relayLog.Error == ""
	}
	return status == "success"
}

func relayLogDurationForHealth(relayLog model.RelayLog) int {
	if relayLog.TotalLatencyMS > 0 {
		return relayLog.TotalLatencyMS
	}
	return relayLog.UseTime
}

func relayLogCacheTokenTotalForHealth(relayLog model.RelayLog) int {
	if relayLog.CacheTokens > 0 {
		return relayLog.CacheTokens
	}
	total := 0
	if relayLog.CacheReadTokens != nil {
		total += *relayLog.CacheReadTokens
	}
	if relayLog.CacheWriteTokens != nil {
		total += *relayLog.CacheWriteTokens
	}
	return total
}

func relayLogCostForHealth(relayLog model.RelayLog) float64 {
	if relayLog.TotalAttemptCost > 0 {
		return relayLog.TotalAttemptCost
	}
	if relayLog.FinalSuccessCost > 0 {
		return relayLog.FinalSuccessCost
	}
	if relayLog.EstimatedCost > 0 {
		return relayLog.EstimatedCost
	}
	return relayLog.Cost
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func firstPositiveInt(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func firstPositiveInt64(values ...int64) int64 {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}
