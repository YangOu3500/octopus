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

func BuildRoutingPreview(ctx context.Context, groupID int) (*model.GroupRoutingPreview, error) {
	group, err := op.GroupGet(groupID, ctx)
	if err != nil {
		return nil, err
	}
	bindings, err := bindingsByItems(ctx, group.Items)
	if err != nil {
		return nil, err
	}

	preview := &model.GroupRoutingPreview{
		GroupID:            group.ID,
		GroupName:          group.Name,
		GroupMode:          group.Mode,
		HealthScoreEnabled: balancer.IsHealthSchedulingEnabled(),
		Candidates:         make([]model.GroupRoutingCandidate, 0, len(group.Items)),
	}
	concurrencyConfig := balancer.CurrentChannelConcurrencyConfig()
	preview.ChannelConcurrencyEnabled = concurrencyConfig.Enabled
	preview.ChannelConcurrencyMode = concurrencyConfig.Mode
	preview.ChannelConcurrencyMax = concurrencyConfig.MaxInFlight
	preview.ChannelConcurrencyLeaseMS = int64(concurrencyConfig.LeaseTTL / time.Millisecond)

	for _, item := range group.Items {
		preview.Candidates = append(preview.Candidates, routingCandidate(ctx, group.Mode, preview.HealthScoreEnabled, item, bindingPointer(bindings, item.ChannelID)))
	}

	sortRoutingCandidates(preview.GroupMode, preview.HealthScoreEnabled, preview.Candidates)
	for i := range preview.Candidates {
		preview.Candidates[i].Rank = i + 1
	}
	return preview, nil
}

func routingCandidate(ctx context.Context, mode model.GroupMode, healthEnabled bool, item model.GroupItem, binding *model.SiteChannelBinding) model.GroupRoutingCandidate {
	stats := balancer.GetHealthStats(item.ChannelID, item.ModelName)
	candidate := model.GroupRoutingCandidate{
		GroupItemID:              item.ID,
		ChannelID:                item.ChannelID,
		ModelName:                item.ModelName,
		Priority:                 item.Priority,
		Weight:                   normalizedWeight(item.Weight),
		HealthScore:              stats.HealthScore,
		SampleCount:              stats.SampleCount,
		SuccessCount:             stats.SuccessCount,
		FailureCount:             stats.FailureCount,
		SuccessRate:              stats.SuccessRate,
		EmptyResponseRate:        stats.EmptyResponseRate,
		RateLimitCount:           stats.RateLimitCount,
		AvgTTFBMS:                stats.AvgTTFBMS,
		AvgTotalMS:               stats.AvgTotalMS,
		ActiveSelections:         activeSelectionsForPreview(healthEnabled, item),
		ChannelConcurrencyActive: channelConcurrencyActiveForPreview(item),
		QuotaStatus:              "unknown",
		CapacityStatus:           "unknown",
		Decision:                 "ready",
	}
	concurrencyConfig := balancer.CurrentChannelConcurrencyConfig()
	if concurrencyConfig.Enabled {
		candidate.ChannelConcurrencyLimit = concurrencyConfig.MaxInFlight
		candidate.ChannelConcurrencyMode = concurrencyConfig.Mode
	}
	if candidate.ActiveSelections > 0 {
		candidate.Notes = append(candidate.Notes, "active selections: "+strconv.Itoa(candidate.ActiveSelections))
	}

	channel, err := op.ChannelGet(item.ChannelID, ctx)
	if err != nil || channel == nil {
		candidate.ChannelName = "channel-" + strconv.Itoa(item.ChannelID)
		candidate.Enabled = false
		candidate.Decision = "channel_missing"
		candidate.Notes = append(candidate.Notes, "channel not found")
		candidate.EffectiveScore = effectiveRoutingScore(mode, healthEnabled, candidate)
		return candidate
	}

	candidate.ChannelName = channel.Name
	candidate.Enabled = channel.Enabled
	applyCandidateRuntimeState(ctx, &candidate, *channel, item.ModelName, binding)
	if !channel.Enabled {
		candidate.Decision = "channel_disabled"
		candidate.Notes = append(candidate.Notes, "channel disabled")
	}

	keySelection := selectPreviewKey(channel, item.ModelName, candidate.SiteID, candidate.SiteAccountID)
	usedKey := keySelection.Key
	candidate.ChannelKeyID = usedKey.ID
	applyCandidateKeyCapacity(&candidate, usedKey)
	applyCandidateCooldownCapacity(&candidate, keySelection.SkippedReason, keySelection.SkippedRemaining.Milliseconds())
	if keySelection.SkippedCoolingCount > 0 {
		candidate.Notes = append(candidate.Notes, "skipped cooling keys: "+strconv.Itoa(keySelection.SkippedCoolingCount))
	}
	if keySelection.SkippedUnavailableCount > 0 {
		candidate.Notes = append(candidate.Notes, "skipped blocked keys: "+strconv.Itoa(keySelection.SkippedUnavailableCount))
	}
	if usedKey.ID == 0 || strings.TrimSpace(usedKey.ChannelKey) == "" {
		if keySelection.SkippedDecision == "" {
			if model.HasAttemptCapacityMeta(keySelection.BlockedMeta) {
				applyCandidateAttemptCapacityMeta(&candidate, keySelection.BlockedMeta)
			} else {
				applyCandidateQuotaStatus(&candidate, quotaStatusNoKey, "no_available_key")
				applyCandidateCapacitySignal(&candidate, capacityStatusBlocked, "no_available_key", "channel_key", "key_selection", 0, 0)
			}
		}
		if candidate.Decision != "ready" {
			candidate.Notes = append(candidate.Notes, "no available key")
		} else if keySelection.SkippedDecision != "" {
			candidate.Decision = keySelection.SkippedDecision
			candidate.CoolingDown = true
			candidate.CooldownRemainingMS = keySelection.SkippedRemaining.Milliseconds()
			candidate.CooldownReason = keySelection.SkippedReason
			candidate.Notes = append(candidate.Notes, keySelection.SkippedDecision)
		} else {
			candidate.Decision = "no_available_key"
			candidate.Notes = append(candidate.Notes, "no available key")
		}
	}

	if usedKey.ID > 0 {
		cooling, remaining, reason := previewKeyCoolingState(channel.ID, usedKey.ID, candidate.SiteID, candidate.SiteAccountID, item.ModelName, channel.GetBaseUrl())
		candidate.CoolingDown = cooling
		if remaining > 0 {
			candidate.CooldownRemainingMS = remaining.Milliseconds()
		}
		candidate.CooldownReason = reason
		if cooling {
			applyCandidateCooldownCapacity(&candidate, reason, candidate.CooldownRemainingMS)
			if candidate.Decision == "ready" {
				candidate.Decision = "health_cooldown"
			}
			candidate.Notes = append(candidate.Notes, "health cooldown active")
		}
	}

	candidate.EffectiveScore = effectiveRoutingScore(mode, healthEnabled, candidate)
	return candidate
}

func applyCandidateRuntimeState(ctx context.Context, candidate *model.GroupRoutingCandidate, channel model.Channel, modelName string, binding *model.SiteChannelBinding) {
	if candidate == nil {
		return
	}
	candidate.QuotaStatus = "unknown"
	candidate.CapacityStatus = "unknown"
	if binding == nil {
		return
	}

	state, err := EvaluateRuntimeCandidate(ctx, channel, modelName)
	if err != nil {
		candidate.Decision = "managed_runtime_check_failed"
		candidate.Notes = append(candidate.Notes, "managed runtime check failed")
		return
	}
	candidate.SiteID = state.SiteID
	candidate.SiteName = state.SiteName
	candidate.SiteAccountID = state.SiteAccountID
	candidate.SiteAccountName = state.SiteAccountName
	candidate.QuotaStatus = state.QuotaStatus
	candidate.QuotaReason = state.QuotaReason
	candidate.QuotaBalance = state.QuotaBalance
	candidate.QuotaUsed = state.QuotaUsed
	candidate.CapacityStatus = state.CapacityStatus
	candidate.CapacityReason = state.CapacityReason
	candidate.CapacityScope = state.CapacityScope
	candidate.CapacitySource = state.CapacitySource
	candidate.LastObservedAt = state.LastObservedAt
	candidate.ExpiresAt = state.ExpiresAt
	if state.SkipReason != "" {
		candidate.Decision = state.SkipReason
		candidate.Notes = append(candidate.Notes, state.SkipReason)
	}
}

func selectPreviewKey(channel *model.Channel, modelName string, siteID int, siteAccountID int) channelKeySelection {
	return selectGroupHealthChannelKey(channel, modelName, siteID, siteAccountID)
}

func previewKeyCoolingState(channelID, channelKeyID, siteID, siteAccountID int, modelName, baseURL string) (bool, time.Duration, string) {
	return balancer.IsHealthCoolingDownWithScope(channelID, channelKeyID, siteID, siteAccountID, modelName, baseURL)
}

func sortRoutingCandidates(mode model.GroupMode, healthEnabled bool, candidates []model.GroupRoutingCandidate) {
	sort.SliceStable(candidates, func(i, j int) bool {
		leftReady := candidates[i].Decision == "ready"
		rightReady := candidates[j].Decision == "ready"
		if leftReady != rightReady {
			return leftReady
		}
		switch mode {
		case model.GroupModeFailover:
			if candidates[i].Priority != candidates[j].Priority {
				return candidates[i].Priority < candidates[j].Priority
			}
			if healthEnabled && candidates[i].HealthScore != candidates[j].HealthScore {
				return candidates[i].HealthScore > candidates[j].HealthScore
			}
			if healthEnabled && candidates[i].ActiveSelections != candidates[j].ActiveSelections {
				return candidates[i].ActiveSelections < candidates[j].ActiveSelections
			}
			if candidates[i].Weight != candidates[j].Weight {
				return candidates[i].Weight > candidates[j].Weight
			}
		case model.GroupModeWeighted:
			if candidates[i].EffectiveScore != candidates[j].EffectiveScore {
				return candidates[i].EffectiveScore > candidates[j].EffectiveScore
			}
		case model.GroupModeRandom, model.GroupModeRoundRobin:
			if healthEnabled {
				leftBand := healthBandForPreview(candidates[i].HealthScore)
				rightBand := healthBandForPreview(candidates[j].HealthScore)
				if leftBand != rightBand {
					return leftBand > rightBand
				}
				if candidates[i].ActiveSelections != candidates[j].ActiveSelections {
					return candidates[i].ActiveSelections < candidates[j].ActiveSelections
				}
			}
			if candidates[i].Priority != candidates[j].Priority {
				return candidates[i].Priority < candidates[j].Priority
			}
		}
		if candidates[i].ChannelID != candidates[j].ChannelID {
			return candidates[i].ChannelID < candidates[j].ChannelID
		}
		return candidates[i].GroupItemID < candidates[j].GroupItemID
	})
}

func effectiveRoutingScore(mode model.GroupMode, healthEnabled bool, candidate model.GroupRoutingCandidate) float64 {
	score := 100.0
	if healthEnabled {
		score = candidate.HealthScore
	}
	weight := float64(normalizedWeight(candidate.Weight))
	if candidate.Decision != "ready" {
		score = score * 0.1
	}
	if healthEnabled && candidate.ActiveSelections > 0 {
		score = score / float64(candidate.ActiveSelections+1)
	}
	switch mode {
	case model.GroupModeWeighted:
		return weight * score / 100
	case model.GroupModeFailover:
		priorityPenalty := float64(candidate.Priority) * 1000
		return score + weight - priorityPenalty
	default:
		return score
	}
}

func healthBandForPreview(score float64) int {
	switch {
	case score >= 60:
		return 2
	case score >= 25:
		return 1
	default:
		return 0
	}
}

func normalizedWeight(value int) int {
	if value <= 0 {
		return 1
	}
	return value
}

func activeSelectionsForPreview(healthEnabled bool, item model.GroupItem) int {
	if !healthEnabled {
		return 0
	}
	return balancer.ActiveSelectionCount(item.ChannelID, item.ModelName)
}

func channelConcurrencyActiveForPreview(item model.GroupItem) int {
	cfg := balancer.CurrentChannelConcurrencyConfig()
	if !cfg.Enabled {
		return 0
	}
	return balancer.ActiveChannelConcurrencyCount(item.ChannelID, item.ModelName)
}
