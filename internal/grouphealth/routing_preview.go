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

	preview := &model.GroupRoutingPreview{
		GroupID:            group.ID,
		GroupName:          group.Name,
		GroupMode:          group.Mode,
		HealthScoreEnabled: balancer.IsHealthSchedulingEnabled(),
		Candidates:         make([]model.GroupRoutingCandidate, 0, len(group.Items)),
	}

	for _, item := range group.Items {
		preview.Candidates = append(preview.Candidates, routingCandidate(ctx, group.Mode, preview.HealthScoreEnabled, item))
	}

	sortRoutingCandidates(preview.GroupMode, preview.HealthScoreEnabled, preview.Candidates)
	for i := range preview.Candidates {
		preview.Candidates[i].Rank = i + 1
	}
	return preview, nil
}

func routingCandidate(ctx context.Context, mode model.GroupMode, healthEnabled bool, item model.GroupItem) model.GroupRoutingCandidate {
	stats := balancer.GetHealthStats(item.ChannelID, item.ModelName)
	candidate := model.GroupRoutingCandidate{
		GroupItemID:       item.ID,
		ChannelID:         item.ChannelID,
		ModelName:         item.ModelName,
		Priority:          item.Priority,
		Weight:            normalizedWeight(item.Weight),
		HealthScore:       stats.HealthScore,
		SampleCount:       stats.SampleCount,
		SuccessCount:      stats.SuccessCount,
		FailureCount:      stats.FailureCount,
		SuccessRate:       stats.SuccessRate,
		EmptyResponseRate: stats.EmptyResponseRate,
		RateLimitCount:    stats.RateLimitCount,
		AvgTTFBMS:         stats.AvgTTFBMS,
		AvgTotalMS:        stats.AvgTotalMS,
		Decision:          "ready",
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
	if !channel.Enabled {
		candidate.Decision = "channel_disabled"
		candidate.Notes = append(candidate.Notes, "channel disabled")
	}

	usedKey, skippedDecision, skippedRemaining, skippedReason, skippedCount := selectPreviewKey(channel, item.ModelName)
	candidate.ChannelKeyID = usedKey.ID
	if skippedCount > 0 {
		candidate.Notes = append(candidate.Notes, "skipped cooling keys: "+strconv.Itoa(skippedCount))
	}
	if usedKey.ID == 0 || strings.TrimSpace(usedKey.ChannelKey) == "" {
		if skippedDecision != "" {
			candidate.Decision = skippedDecision
			candidate.CoolingDown = true
			candidate.CooldownRemainingMS = skippedRemaining.Milliseconds()
			candidate.CooldownReason = skippedReason
			candidate.Notes = append(candidate.Notes, skippedDecision)
		} else {
			candidate.Decision = "no_available_key"
			candidate.Notes = append(candidate.Notes, "no available key")
		}
	}

	if usedKey.ID > 0 {
		cooling, remaining, reason := previewKeyCoolingState(channel.ID, usedKey.ID, item.ModelName, channel.GetBaseUrl())
		candidate.CoolingDown = cooling
		if remaining > 0 {
			candidate.CooldownRemainingMS = remaining.Milliseconds()
		}
		candidate.CooldownReason = reason
		if cooling {
			candidate.Decision = "health_cooldown"
			candidate.Notes = append(candidate.Notes, "health cooldown active")
		}
	}

	candidate.EffectiveScore = effectiveRoutingScore(mode, healthEnabled, candidate)
	return candidate
}

func selectPreviewKey(channel *model.Channel, modelName string) (model.ChannelKey, string, time.Duration, string, int) {
	exclude := map[int]struct{}{}
	var lastDecision string
	var lastRemaining time.Duration
	var lastReason string
	var skipped int

	for {
		usedKey := channel.GetChannelKey(model.ChannelKeySelectOptions{ExcludeKeyIDs: exclude})
		if usedKey.ID == 0 || strings.TrimSpace(usedKey.ChannelKey) == "" {
			return model.ChannelKey{}, lastDecision, lastRemaining, lastReason, skipped
		}

		if tripped, remaining := balancer.IsTripped(channel.ID, usedKey.ID, modelName); tripped {
			exclude[usedKey.ID] = struct{}{}
			lastDecision = "circuit_breaker"
			lastRemaining = remaining
			lastReason = "circuit_breaker"
			skipped++
			continue
		}

		if cooling, remaining, reason := previewKeyCoolingState(channel.ID, usedKey.ID, modelName, channel.GetBaseUrl()); cooling {
			exclude[usedKey.ID] = struct{}{}
			lastDecision = "health_cooldown"
			lastRemaining = remaining
			lastReason = reason
			skipped++
			continue
		}

		return usedKey, lastDecision, lastRemaining, lastReason, skipped
	}
}

func previewKeyCoolingState(channelID, channelKeyID int, modelName, baseURL string) (bool, time.Duration, string) {
	return balancer.IsHealthCoolingDown(channelID, channelKeyID, modelName, baseURL)
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
