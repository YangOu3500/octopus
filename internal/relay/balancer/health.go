package balancer

import (
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
)

type HealthAttempt struct {
	ChannelID     int
	ChannelKeyID  int
	ModelName     string
	BaseURL       string
	Status        model.AttemptStatus
	HTTPStatus    int
	FailureReason string
	RetryAfter    time.Duration
	TTFBMS        int
	TotalMS       int
}

type HealthStats struct {
	ChannelID         int     `json:"channel_id"`
	ModelName         string  `json:"model_name"`
	HealthScore       float64 `json:"health_score"`
	SampleCount       int     `json:"sample_count"`
	SuccessCount      int     `json:"success_count"`
	FailureCount      int     `json:"failure_count"`
	SuccessRate       float64 `json:"success_rate"`
	EmptyResponseRate float64 `json:"empty_response_rate"`
	RateLimitCount    int     `json:"rate_limit_count"`
	AvgTTFBMS         int     `json:"avg_ttfb_ms"`
	AvgTotalMS        int     `json:"avg_total_ms"`
}

type HealthCooldownPolicy struct {
	Reason              string   `json:"reason"`
	Scopes              []string `json:"scopes"`
	BaseSeconds         int      `json:"base_seconds"`
	MaxSeconds          int      `json:"max_seconds"`
	UsesRetryAfter      bool     `json:"uses_retry_after"`
	ExponentialBackoff  bool     `json:"exponential_backoff"`
	ModelScoped         bool     `json:"model_scoped"`
	ClearedOnSuccess    bool     `json:"cleared_on_success"`
	HealthScoreRequired bool     `json:"health_score_required"`
}

type healthConfig struct {
	Enabled                    bool
	Window                     time.Duration
	MinConfidentSample         int
	SuccessRatePenaltyWeight   float64
	EmptyResponsePenaltyWeight float64
	LatencyPenaltyWeight       float64
}

type healthKey struct {
	ChannelID int
	ModelName string
}

type cooldownKey struct {
	Scope        string
	ChannelID    int
	ChannelKeyID int
	ModelName    string
	BaseURL      string
}

type healthWindowSample struct {
	At            time.Time
	Success       bool
	EmptyResponse bool
	RateLimited   bool
	TTFBMS        int
	TotalMS       int
}

type healthEntry struct {
	Samples []healthWindowSample
}

type cooldownEntry struct {
	Until       time.Time
	Reason      string
	Failures    int
	LastFailure time.Time
}

var (
	healthMu             sync.RWMutex
	healthByChannelModel = make(map[healthKey]*healthEntry)
	cooldowns            = make(map[cooldownKey]*cooldownEntry)
	healthConfigOverride *healthConfig
)

func ListHealthCooldownPolicies() []HealthCooldownPolicy {
	reasons := []string{
		"auth_error",
		"quota_error",
		"rate_limit",
		"server_error",
		"timeout_error",
		"first_byte_timeout",
		"network_error",
		"invalid_json",
		"invalid_sse",
		"empty_body",
		"empty_choices",
		"missing_choices",
		"empty_content",
		"zero_completion_tokens",
		"empty_output",
		"no_valid_output",
		"zero_output_tokens",
		"stop_without_content",
		"empty_candidates",
		"candidate_without_parts",
		"no_valid_candidate",
		"blocked_no_valid_reply",
		"stream_no_valid_chunk",
		"stream_done_without_content",
		"stream_buffer_exceeded",
		"html_or_login_page",
		"cloudflare_page",
		"upstream_error_json",
		"attempt_failed",
	}
	policies := make([]HealthCooldownPolicy, 0, len(reasons))
	for _, reason := range reasons {
		policies = append(policies, HealthCooldownPolicy{
			Reason:              reason,
			Scopes:              cooldownScopesForReason(reason, true),
			BaseSeconds:         int(cooldownPolicy(reason, 0).Seconds()),
			MaxSeconds:          int((30 * time.Minute).Seconds()),
			UsesRetryAfter:      reason == "rate_limit",
			ExponentialBackoff:  cooldownPolicyUsesBackoff(reason),
			ModelScoped:         true,
			ClearedOnSuccess:    true,
			HealthScoreRequired: true,
		})
	}
	return policies
}

func IsHealthSchedulingEnabled() bool {
	return currentHealthConfig().Enabled
}

func RecordHealthAttempt(attempt HealthAttempt) {
	cfg := currentHealthConfig()
	if !cfg.Enabled || attempt.ChannelID <= 0 || strings.TrimSpace(attempt.ModelName) == "" {
		return
	}

	now := time.Now()
	reason := classifyHealthFailure(attempt.HTTPStatus, attempt.FailureReason)
	sample := healthWindowSample{
		At:            now,
		Success:       attempt.Status == model.AttemptSuccess,
		EmptyResponse: isEmptyResponseFailure(reason),
		RateLimited:   reason == "rate_limit",
		TTFBMS:        attempt.TTFBMS,
		TotalMS:       attempt.TotalMS,
	}

	key := healthKey{ChannelID: attempt.ChannelID, ModelName: strings.TrimSpace(attempt.ModelName)}

	healthMu.Lock()
	defer healthMu.Unlock()

	entry := healthByChannelModel[key]
	if entry == nil {
		entry = &healthEntry{}
		healthByChannelModel[key] = entry
	}
	entry.Samples = pruneHealthSamples(append(entry.Samples, sample), now, cfg.Window)

	if attempt.Status == model.AttemptSuccess {
		clearCooldownsLocked(attempt.ChannelID, attempt.ChannelKeyID, key.ModelName, attempt.BaseURL)
		return
	}
	if attempt.Status != model.AttemptFailed {
		return
	}

	for _, ck := range cooldownKeysForFailure(attempt, reason) {
		policy := cooldownPolicy(reason, attempt.RetryAfter)
		if policy <= 0 {
			continue
		}
		cd := cooldowns[ck]
		if cd == nil {
			cd = &cooldownEntry{}
			cooldowns[ck] = cd
		}
		if now.Sub(cd.LastFailure) > cfg.Window {
			cd.Failures = 0
		}
		cd.Failures++
		cd.LastFailure = now
		cd.Reason = reason
		cd.Until = now.Add(applyCooldownBackoff(policy, cd.Failures, reason, attempt.RetryAfter))
	}
}

func IsHealthCoolingDown(channelID, channelKeyID int, modelName, baseURL string) (bool, time.Duration, string) {
	cfg := currentHealthConfig()
	if !cfg.Enabled || channelID <= 0 || strings.TrimSpace(modelName) == "" {
		return false, 0, ""
	}
	now := time.Now()
	keys := []cooldownKey{
		{Scope: "key", ChannelID: channelID, ChannelKeyID: channelKeyID, ModelName: modelName},
		{Scope: "channel", ChannelID: channelID, ModelName: modelName},
	}
	baseURL = normalizeHealthBaseURL(baseURL)
	if baseURL != "" {
		keys = append(keys, cooldownKey{Scope: "base_url", BaseURL: baseURL, ModelName: modelName})
	}

	healthMu.Lock()
	defer healthMu.Unlock()

	var remaining time.Duration
	var reason string
	for _, key := range keys {
		entry := cooldowns[key]
		if entry == nil {
			continue
		}
		if !entry.Until.After(now) {
			delete(cooldowns, key)
			continue
		}
		r := entry.Until.Sub(now)
		if r > remaining {
			remaining = r
			reason = entry.Reason
		}
	}
	return remaining > 0, remaining, reason
}

func HealthScore(channelID int, modelName string) float64 {
	cfg := currentHealthConfig()
	if !cfg.Enabled || channelID <= 0 || strings.TrimSpace(modelName) == "" {
		return 100
	}

	now := time.Now()
	key := healthKey{ChannelID: channelID, ModelName: strings.TrimSpace(modelName)}

	healthMu.Lock()
	defer healthMu.Unlock()

	entry := healthByChannelModel[key]
	if entry == nil || len(entry.Samples) == 0 {
		return 100
	}
	entry.Samples = pruneHealthSamples(entry.Samples, now, cfg.Window)
	return scoreSamples(entry.Samples, cfg)
}

func GetHealthStats(channelID int, modelName string) HealthStats {
	modelName = strings.TrimSpace(modelName)
	stats := HealthStats{
		ChannelID:   channelID,
		ModelName:   modelName,
		HealthScore: HealthScore(channelID, modelName),
	}
	if channelID <= 0 || modelName == "" {
		return stats
	}

	cfg := currentHealthConfig()
	now := time.Now()
	key := healthKey{ChannelID: channelID, ModelName: modelName}

	healthMu.Lock()
	defer healthMu.Unlock()

	entry := healthByChannelModel[key]
	if entry == nil || len(entry.Samples) == 0 {
		return stats
	}
	entry.Samples = pruneHealthSamples(entry.Samples, now, cfg.Window)
	if len(entry.Samples) == 0 {
		return stats
	}

	var emptyFailures int
	var totalTTFB int
	var ttfbSamples int
	var totalLatency int
	var latencySamples int
	for _, sample := range entry.Samples {
		stats.SampleCount++
		if sample.Success {
			stats.SuccessCount++
		} else {
			stats.FailureCount++
		}
		if sample.EmptyResponse {
			emptyFailures++
		}
		if sample.RateLimited {
			stats.RateLimitCount++
		}
		if sample.TTFBMS > 0 {
			totalTTFB += sample.TTFBMS
			ttfbSamples++
		}
		if sample.TotalMS > 0 {
			totalLatency += sample.TotalMS
			latencySamples++
		}
	}
	if stats.SampleCount > 0 {
		stats.SuccessRate = float64(stats.SuccessCount) / float64(stats.SampleCount)
		stats.EmptyResponseRate = float64(emptyFailures) / float64(stats.SampleCount)
	}
	if ttfbSamples > 0 {
		stats.AvgTTFBMS = totalTTFB / ttfbSamples
	}
	if latencySamples > 0 {
		stats.AvgTotalMS = totalLatency / latencySamples
	}
	return stats
}

func healthCandidates(mode model.GroupMode, items []model.GroupItem) []model.GroupItem {
	if len(items) == 0 {
		return nil
	}
	switch mode {
	case model.GroupModeFailover:
		result := sortByPriority(items)
		sort.SliceStable(result, func(i, j int) bool {
			if result[i].Priority != result[j].Priority {
				return result[i].Priority < result[j].Priority
			}
			left := HealthScore(result[i].ChannelID, result[i].ModelName)
			right := HealthScore(result[j].ChannelID, result[j].ModelName)
			if left != right {
				return left > right
			}
			if result[i].Weight != result[j].Weight {
				return result[i].Weight > result[j].Weight
			}
			return result[i].ID < result[j].ID
		})
		return result
	case model.GroupModeWeighted:
		return weightedHealthCandidates(items)
	case model.GroupModeRandom:
		result := (&Random{}).Candidates(items)
		sort.SliceStable(result, func(i, j int) bool {
			return healthBand(result[i]) > healthBand(result[j])
		})
		return result
	case model.GroupModeRoundRobin:
		result := (&RoundRobin{}).Candidates(items)
		sort.SliceStable(result, func(i, j int) bool {
			return healthBand(result[i]) > healthBand(result[j])
		})
		return result
	default:
		return GetBalancer(mode).Candidates(items)
	}
}

func weightedHealthCandidates(items []model.GroupItem) []model.GroupItem {
	type weightedItem struct {
		item  model.GroupItem
		score float64
	}
	scored := make([]weightedItem, 0, len(items))
	for _, item := range items {
		weight := item.Weight
		if weight <= 0 {
			weight = 1
		}
		health := math.Max(1, HealthScore(item.ChannelID, item.ModelName))
		scored = append(scored, weightedItem{
			item:  item,
			score: rand.Float64() * float64(weight) * health / 100,
		})
	}
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})
	result := make([]model.GroupItem, len(scored))
	for i := range scored {
		result[i] = scored[i].item
	}
	return result
}

func healthBand(item model.GroupItem) int {
	score := HealthScore(item.ChannelID, item.ModelName)
	switch {
	case score >= 60:
		return 2
	case score >= 25:
		return 1
	default:
		return 0
	}
}

func scoreSamples(samples []healthWindowSample, cfg healthConfig) float64 {
	total := len(samples)
	if total == 0 {
		return 100
	}
	failures := 0
	emptyFailures := 0
	var totalLatency int
	latencySamples := 0
	for _, sample := range samples {
		if !sample.Success {
			failures++
		}
		if sample.EmptyResponse {
			emptyFailures++
		}
		if sample.TotalMS > 0 {
			totalLatency += sample.TotalMS
			latencySamples++
		}
	}
	confidence := math.Min(1, float64(total)/float64(maxInt(cfg.MinConfidentSample, 1)))
	failurePenalty := float64(failures) / float64(total) * cfg.SuccessRatePenaltyWeight * confidence
	emptyPenalty := float64(emptyFailures) / float64(total) * cfg.EmptyResponsePenaltyWeight * confidence

	latencyPenalty := 0.0
	if latencySamples > 0 {
		avgLatency := float64(totalLatency) / float64(latencySamples)
		latencyPenalty = math.Min(30, avgLatency/1000*cfg.LatencyPenaltyWeight)
	}
	return clampFloat(100-failurePenalty-emptyPenalty-latencyPenalty, 0, 100)
}

func pruneHealthSamples(samples []healthWindowSample, now time.Time, window time.Duration) []healthWindowSample {
	if window <= 0 {
		return samples
	}
	cutoff := now.Add(-window)
	idx := 0
	for idx < len(samples) && samples[idx].At.Before(cutoff) {
		idx++
	}
	if idx == 0 {
		return samples
	}
	out := make([]healthWindowSample, len(samples)-idx)
	copy(out, samples[idx:])
	return out
}

func cooldownKeysForFailure(attempt HealthAttempt, reason string) []cooldownKey {
	modelName := strings.TrimSpace(attempt.ModelName)
	baseURL := normalizeHealthBaseURL(attempt.BaseURL)
	key := cooldownKey{Scope: "key", ChannelID: attempt.ChannelID, ChannelKeyID: attempt.ChannelKeyID, ModelName: modelName}
	channel := cooldownKey{Scope: "channel", ChannelID: attempt.ChannelID, ModelName: modelName}
	base := cooldownKey{Scope: "base_url", BaseURL: baseURL, ModelName: modelName}

	scopes := cooldownScopesForReason(reason, baseURL != "")
	keys := make([]cooldownKey, 0, len(scopes))
	for _, scope := range scopes {
		switch scope {
		case "key":
			keys = append(keys, key)
		case "channel":
			keys = append(keys, channel)
		case "base_url":
			keys = append(keys, base)
		}
	}
	return keys
}

func cooldownScopesForReason(reason string, hasBaseURL bool) []string {
	switch reason {
	case "auth_error", "quota_error", "rate_limit":
		return []string{"key"}
	case "server_error", "timeout_error", "first_byte_timeout", "network_error":
		if hasBaseURL {
			return []string{"channel", "base_url"}
		}
		return []string{"channel"}
	default:
		return []string{"channel"}
	}
}

func cooldownPolicy(reason string, retryAfter time.Duration) time.Duration {
	switch reason {
	case "auth_error":
		return 300 * time.Second
	case "quota_error":
		return 1800 * time.Second
	case "rate_limit":
		if retryAfter > 0 {
			return retryAfter
		}
		return 60 * time.Second
	case "server_error":
		return 120 * time.Second
	case "timeout_error", "first_byte_timeout", "network_error":
		return 60 * time.Second
	case "invalid_json", "invalid_sse", "empty_body", "empty_choices", "missing_choices",
		"empty_content", "zero_completion_tokens", "empty_output", "no_valid_output",
		"zero_output_tokens", "stop_without_content", "empty_candidates",
		"candidate_without_parts", "no_valid_candidate", "blocked_no_valid_reply",
		"stream_no_valid_chunk", "stream_done_without_content", "stream_buffer_exceeded":
		return 30 * time.Second
	case "html_or_login_page", "cloudflare_page", "upstream_error_json":
		return 120 * time.Second
	default:
		return 30 * time.Second
	}
}

func applyCooldownBackoff(base time.Duration, failures int, reason string, retryAfter time.Duration) time.Duration {
	if reason == "auth_error" || reason == "quota_error" || retryAfter > 0 {
		return base
	}
	if failures <= 1 {
		return base
	}
	shift := failures - 1
	if shift > 4 {
		shift = 4
	}
	cooldown := base * time.Duration(1<<shift)
	maxCooldown := 30 * time.Minute
	if cooldown > maxCooldown {
		return maxCooldown
	}
	return cooldown
}

func cooldownPolicyUsesBackoff(reason string) bool {
	switch reason {
	case "auth_error", "quota_error":
		return false
	default:
		return true
	}
}

func classifyHealthFailure(statusCode int, failureReason string) string {
	reason := normalizeHealthReason(failureReason)
	switch {
	case statusCode == 401 || statusCode == 403:
		return "auth_error"
	case statusCode == 402:
		return "quota_error"
	case statusCode == 429:
		return "rate_limit"
	case statusCode >= 500:
		return "server_error"
	}
	if reason == "" {
		if statusCode == 0 {
			return "network_error"
		}
		return "attempt_failed"
	}
	if strings.Contains(reason, "insufficient_quota") || strings.Contains(reason, "quota") {
		return "quota_error"
	}
	if strings.Contains(reason, "timeout") && strings.Contains(reason, "first") {
		return "first_byte_timeout"
	}
	if strings.Contains(reason, "timeout") {
		return "timeout_error"
	}
	if strings.Contains(reason, "network") || strings.Contains(reason, "connection") {
		return "network_error"
	}
	return reason
}

func normalizeHealthReason(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}
	const validationPrefix = "response validation failed:"
	if strings.HasPrefix(value, validationPrefix) {
		value = strings.TrimSpace(value[len(validationPrefix):])
	}
	if strings.HasPrefix(value, "channel ") {
		if idx := strings.Index(value, "failed:"); idx >= 0 {
			value = strings.TrimSpace(value[idx+len("failed:"):])
		}
	}
	if idx := strings.IndexAny(value, ":\r\n"); idx >= 0 {
		value = value[:idx]
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var b strings.Builder
	lastUnderscore := false
	for _, r := range value {
		isASCIIAlphaNum := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if isASCIIAlphaNum {
			b.WriteRune(r)
			lastUnderscore = false
			continue
		}
		if !lastUnderscore {
			b.WriteByte('_')
			lastUnderscore = true
		}
	}
	return strings.Trim(b.String(), "_")
}

func isEmptyResponseFailure(reason string) bool {
	switch reason {
	case "empty_body", "missing_choices", "empty_choices", "empty_content",
		"zero_completion_tokens", "empty_output", "no_valid_output",
		"zero_output_tokens", "stop_without_content", "empty_candidates",
		"candidate_without_parts", "no_valid_candidate", "blocked_no_valid_reply",
		"stream_no_valid_chunk", "stream_done_without_content":
		return true
	default:
		return false
	}
}

func clearCooldownsLocked(channelID, channelKeyID int, modelName, baseURL string) {
	baseURL = normalizeHealthBaseURL(baseURL)
	for key := range cooldowns {
		if key.ModelName != modelName {
			continue
		}
		if key.Scope == "key" && key.ChannelID == channelID && key.ChannelKeyID == channelKeyID {
			delete(cooldowns, key)
			continue
		}
		if key.Scope == "channel" && key.ChannelID == channelID {
			delete(cooldowns, key)
			continue
		}
		if key.Scope == "base_url" && baseURL != "" && key.BaseURL == baseURL {
			delete(cooldowns, key)
		}
	}
}

func resetHealthState() {
	healthMu.Lock()
	defer healthMu.Unlock()
	healthByChannelModel = make(map[healthKey]*healthEntry)
	cooldowns = make(map[cooldownKey]*cooldownEntry)
	healthConfigOverride = nil
}

func resetHealthByChannel(channelID int) {
	healthMu.Lock()
	defer healthMu.Unlock()
	for key := range healthByChannelModel {
		if key.ChannelID == channelID {
			delete(healthByChannelModel, key)
		}
	}
	for key := range cooldowns {
		if key.ChannelID == channelID {
			delete(cooldowns, key)
		}
	}
}

func currentHealthConfig() healthConfig {
	if healthConfigOverride != nil {
		return *healthConfigOverride
	}
	enabled, err := op.SettingGetBool(model.SettingKeyHealthScoreEnabled)
	if err != nil {
		enabled = false
	}
	return healthConfig{
		Enabled:                    enabled,
		Window:                     time.Duration(settingInt(model.SettingKeyHealthScoreWindowMinutes, 60)) * time.Minute,
		MinConfidentSample:         settingInt(model.SettingKeyHealthMinConfidentSample, 10),
		SuccessRatePenaltyWeight:   float64(settingInt(model.SettingKeySuccessRatePenaltyWeight, 70)),
		EmptyResponsePenaltyWeight: float64(settingInt(model.SettingKeyEmptyResponsePenaltyWeight, 25)),
		LatencyPenaltyWeight:       float64(settingInt(model.SettingKeyLatencyPenaltyWeight, 8)),
	}
}

func settingInt(key model.SettingKey, fallback int) int {
	value, err := op.SettingGetInt(key)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func normalizeHealthBaseURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return strings.TrimRight(value, "/")
}

func clampFloat(value, minValue, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func healthDebugString(channelID int, modelName string) string {
	return fmt.Sprintf("channel=%d model=%s score=%.1f", channelID, modelName, HealthScore(channelID, modelName))
}
