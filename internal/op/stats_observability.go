package op

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/bestruirui/octopus/internal/model"
)

const statsObservabilityDefaultRange = "24h"

type observabilityAccumulator struct {
	id         int
	name       string
	requests   int
	failures   int
	latencySum int
	latencyN   int
	cost       float64
}

func StatsObservability(ctx context.Context, timeRange string) (model.StatsObservability, error) {
	timeRange = strings.ToLower(strings.TrimSpace(timeRange))
	if timeRange == "" {
		timeRange = statsObservabilityDefaultRange
	}

	query := normalizeRelayLogListQuery(model.RelayLogListQuery{
		Page:      1,
		PageSize:  100,
		TimeRange: timeRange,
		SortBy:    "time",
		SortOrder: "desc",
	})
	logs, err := relayLogCollect(ctx, query)
	if err != nil {
		return model.StatsObservability{}, err
	}

	now := time.Now().Unix()
	startTime := int64(0)
	endTime := now
	if query.StartTime != nil {
		startTime = int64(*query.StartTime)
	}
	if query.EndTime != nil {
		endTime = int64(*query.EndTime)
	}
	if startTime == 0 {
		startTime = inferObservabilityStart(logs, endTime)
	}

	summary := model.StatsObservability{
		TimeRange:      timeRange,
		StartTime:      startTime,
		EndTime:        endTime,
		RecentFailures: make([]model.StatsObservabilityFailure, 0, 8),
	}
	channelAgg := make(map[int]*observabilityAccumulator)
	modelAgg := make(map[string]*observabilityAccumulator)

	var ttfbSum, ttfbCount int
	var latencySum, latencyCount int

	for _, relayLog := range logs {
		summary.TotalRequests++
		if relayLogFinalSuccess(relayLog) {
			summary.SuccessRequests++
		} else {
			summary.FailedRequests++
		}
		if relayLogHasFailover(relayLog) {
			summary.FailoverRequests++
		}

		if relayLog.Ftut > 0 {
			ttfbSum += relayLog.Ftut
			ttfbCount++
		}
		if latency := relayLogDuration(relayLog); latency > 0 {
			latencySum += latency
			latencyCount++
		}

		summary.InputTokens += relayLog.InputTokens
		summary.OutputTokens += relayLog.OutputTokens
		summary.CacheTokens += relayLogCacheTokenTotal(relayLog)
		summary.FinalSuccessCost += observabilityFinalSuccessCost(relayLog)
		summary.TotalAttemptCost += observabilityTotalAttemptCost(relayLog)
		summary.FailedAttemptCost += relayLog.FailedAttemptCost

		if len(summary.RecentFailures) < 8 {
			summary.RecentFailures = append(summary.RecentFailures, relayLogFailures(relayLog)...)
			if len(summary.RecentFailures) > 8 {
				summary.RecentFailures = summary.RecentFailures[:8]
			}
		}

		recordObservabilityBreakdowns(channelAgg, modelAgg, relayLog)
	}

	if summary.TotalRequests > 0 {
		summary.SuccessRate = float64(summary.SuccessRequests) / float64(summary.TotalRequests)
		summary.FailoverRate = float64(summary.FailoverRequests) / float64(summary.TotalRequests)
	}
	if ttfbCount > 0 {
		summary.AvgTTFBMS = ttfbSum / ttfbCount
	}
	if latencyCount > 0 {
		summary.AvgLatencyMS = latencySum / latencyCount
	}
	if minutes := float64(observabilityMaxInt64(1, (endTime-startTime)/60)); minutes > 0 {
		summary.RPM = float64(summary.TotalRequests) / minutes
	}
	summary.TopChannels = observabilityBreakdownList(channelAgg, 5)
	summary.TopModels = observabilityBreakdownList(modelAgg, 5)
	return summary, nil
}

func inferObservabilityStart(logs []model.RelayLog, endTime int64) int64 {
	startTime := endTime - 24*3600
	for _, relayLog := range logs {
		if relayLog.Time > 0 && relayLog.Time < startTime {
			startTime = relayLog.Time
		}
	}
	return startTime
}

func relayLogFinalSuccess(relayLog model.RelayLog) bool {
	status := strings.ToLower(strings.TrimSpace(relayLog.FinalStatus))
	if status == "" {
		return relayLog.Error == ""
	}
	return status == "success"
}

func observabilityFinalSuccessCost(relayLog model.RelayLog) float64 {
	if relayLog.FinalSuccessCost > 0 {
		return relayLog.FinalSuccessCost
	}
	if relayLogFinalSuccess(relayLog) {
		return relayLog.Cost
	}
	return 0
}

func observabilityTotalAttemptCost(relayLog model.RelayLog) float64 {
	if relayLog.TotalAttemptCost > 0 {
		return relayLog.TotalAttemptCost
	}
	if relayLog.FinalSuccessCost > 0 {
		return relayLog.FinalSuccessCost
	}
	return relayLog.Cost
}

func relayLogCacheTokenTotal(relayLog model.RelayLog) int {
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

func relayLogFailures(relayLog model.RelayLog) []model.StatsObservabilityFailure {
	failures := make([]model.StatsObservabilityFailure, 0, 1)
	for _, attempt := range relayLog.Attempts {
		if attempt.Status != model.AttemptFailed && attempt.Status != model.AttemptCircuitBreak {
			continue
		}
		failures = append(failures, model.StatsObservabilityFailure{
			ID:            relayLog.ID,
			Time:          relayLog.Time,
			TraceID:       relayLog.TraceID,
			RequestModel:  relayLog.RequestModelName,
			UpstreamModel: observabilityFirstNonEmptyString(attempt.UpstreamModel, attempt.ModelName),
			ChannelID:     attempt.ChannelID,
			ChannelName:   attempt.ChannelName,
			HTTPStatus:    attempt.HTTPStatus,
			FailureReason: observabilityFirstNonEmptyString(attempt.FailureReason, attempt.ErrorSummary, attempt.Msg, relayLog.Error),
			DurationMS:    observabilityFirstPositiveInt(attempt.TotalMS, attempt.DurationMS, attempt.Duration),
			RequestSource: relayLog.RequestSource,
			ClientIP:      relayLog.ClientIP,
			FinalStatus:   relayLog.FinalStatus,
		})
	}
	if len(failures) == 0 && !relayLogFinalSuccess(relayLog) {
		failures = append(failures, model.StatsObservabilityFailure{
			ID:            relayLog.ID,
			Time:          relayLog.Time,
			TraceID:       relayLog.TraceID,
			RequestModel:  relayLog.RequestModelName,
			UpstreamModel: relayLog.FinalUpstreamModel,
			ChannelID:     relayLog.ChannelId,
			ChannelName:   relayLog.ChannelName,
			HTTPStatus:    observabilityLogHTTPStatus(relayLog),
			FailureReason: relayLog.Error,
			DurationMS:    relayLogDuration(relayLog),
			RequestSource: relayLog.RequestSource,
			ClientIP:      relayLog.ClientIP,
			FinalStatus:   relayLog.FinalStatus,
		})
	}
	return failures
}

func recordObservabilityBreakdowns(channelAgg map[int]*observabilityAccumulator, modelAgg map[string]*observabilityAccumulator, relayLog model.RelayLog) {
	if len(relayLog.Attempts) == 0 {
		channel := getAccumulator(channelAgg, relayLog.ChannelId, relayLog.ChannelName)
		recordAccumulator(channel, !relayLogFinalSuccess(relayLog), relayLogDuration(relayLog), observabilityTotalAttemptCost(relayLog))

		modelName := observabilityFirstNonEmptyString(relayLog.FinalUpstreamModel, relayLog.ActualModelName, relayLog.RequestModelName)
		modelEntry := getAccumulator(modelAgg, modelName, modelName)
		recordAccumulator(modelEntry, !relayLogFinalSuccess(relayLog), relayLogDuration(relayLog), observabilityTotalAttemptCost(relayLog))
		return
	}

	for _, attempt := range relayLog.Attempts {
		channel := getAccumulator(channelAgg, attempt.ChannelID, observabilityFirstNonEmptyString(attempt.ChannelName, relayLog.ChannelName))
		recordAccumulator(channel, attempt.Status == model.AttemptFailed || attempt.Status == model.AttemptCircuitBreak, observabilityFirstPositiveInt(attempt.TotalMS, attempt.DurationMS, attempt.Duration), attemptCost(attempt))

		modelName := observabilityFirstNonEmptyString(attempt.UpstreamModel, attempt.ModelName, relayLog.FinalUpstreamModel, relayLog.ActualModelName, relayLog.RequestModelName)
		modelEntry := getAccumulator(modelAgg, modelName, modelName)
		recordAccumulator(modelEntry, attempt.Status == model.AttemptFailed || attempt.Status == model.AttemptCircuitBreak, observabilityFirstPositiveInt(attempt.TotalMS, attempt.DurationMS, attempt.Duration), attemptCost(attempt))
	}
}

func getAccumulator[K comparable](m map[K]*observabilityAccumulator, key K, name string) *observabilityAccumulator {
	if acc, ok := m[key]; ok {
		if acc.name == "" {
			acc.name = name
		}
		return acc
	}
	acc := &observabilityAccumulator{name: name}
	switch typed := any(key).(type) {
	case int:
		acc.id = typed
	case string:
		acc.name = typed
	}
	m[key] = acc
	return acc
}

func recordAccumulator(acc *observabilityAccumulator, failed bool, latencyMS int, cost float64) {
	if acc == nil {
		return
	}
	acc.requests++
	if failed {
		acc.failures++
	}
	if latencyMS > 0 {
		acc.latencySum += latencyMS
		acc.latencyN++
	}
	acc.cost += cost
}

func observabilityBreakdownList[K comparable](m map[K]*observabilityAccumulator, limit int) []model.StatsObservabilityBreakdown {
	out := make([]model.StatsObservabilityBreakdown, 0, len(m))
	for _, acc := range m {
		if acc == nil || acc.requests == 0 {
			continue
		}
		item := model.StatsObservabilityBreakdown{
			ID:       acc.id,
			Name:     acc.name,
			Requests: acc.requests,
			Failures: acc.failures,
			Cost:     acc.cost,
		}
		success := acc.requests - acc.failures
		if acc.requests > 0 {
			item.SuccessRate = float64(success) / float64(acc.requests)
		}
		if acc.latencyN > 0 {
			item.AvgLatencyMS = acc.latencySum / acc.latencyN
		}
		out = append(out, item)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Failures == out[j].Failures {
			return out[i].Requests > out[j].Requests
		}
		return out[i].Failures > out[j].Failures
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func attemptCost(attempt model.ChannelAttempt) float64 {
	if attempt.EstimatedCost > 0 {
		return attempt.EstimatedCost
	}
	return attempt.InputCost + attempt.OutputCost
}

func observabilityLogHTTPStatus(relayLog model.RelayLog) int {
	for i := len(relayLog.Attempts) - 1; i >= 0; i-- {
		if relayLog.Attempts[i].HTTPStatus > 0 {
			return relayLog.Attempts[i].HTTPStatus
		}
	}
	return 0
}

func observabilityFirstNonEmptyString(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func observabilityFirstPositiveInt(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func observabilityMaxInt64(left, right int64) int64 {
	if left > right {
		return left
	}
	return right
}
