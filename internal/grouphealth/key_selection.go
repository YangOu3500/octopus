package grouphealth

import (
	"strings"
	"time"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/relay/balancer"
)

type channelKeySelection struct {
	Key                     model.ChannelKey
	BlockedMeta             model.AttemptCapacityMeta
	SkippedDecision         string
	SkippedRemaining        time.Duration
	SkippedReason           string
	SkippedCoolingCount     int
	SkippedUnavailableCount int
}

func selectGroupHealthChannelKey(channel *model.Channel, modelName string, siteID int, siteAccountID int) channelKeySelection {
	selection := channelKeySelection{}
	if channel == nil {
		return selection
	}

	exclude := map[int]struct{}{}
	for {
		result := channel.SelectChannelKey(model.ChannelKeySelectOptions{
			ExcludeKeyIDs:           exclude,
			SkipUnavailableStatuses: true,
		})
		selection.SkippedUnavailableCount += result.SkippedUnavailableKeys

		usedKey := result.Key
		if usedKey.ID == 0 || strings.TrimSpace(usedKey.ChannelKey) == "" {
			selection.BlockedMeta = result.BlockedMeta
			return selection
		}

		if tripped, remaining := balancer.IsTripped(channel.ID, usedKey.ID, modelName); tripped {
			exclude[usedKey.ID] = struct{}{}
			selection.SkippedDecision = "circuit_breaker"
			selection.SkippedRemaining = remaining
			selection.SkippedReason = "circuit_breaker"
			selection.SkippedCoolingCount++
			continue
		}

		if cooling, remaining, reason := previewKeyCoolingState(channel.ID, usedKey.ID, siteID, siteAccountID, modelName, channel.GetBaseUrl()); cooling {
			exclude[usedKey.ID] = struct{}{}
			selection.SkippedDecision = "health_cooldown"
			selection.SkippedRemaining = remaining
			selection.SkippedReason = reason
			selection.SkippedCoolingCount++
			continue
		}

		selection.Key = usedKey
		return selection
	}
}

func channelKeySelectionFailureMessage(selection channelKeySelection) string {
	if selection.SkippedDecision != "" {
		return selection.SkippedDecision
	}
	if model.HasAttemptCapacityMeta(selection.BlockedMeta) {
		reason := firstNonEmptyTrimmed(
			selection.BlockedMeta.CapacityReason,
			selection.BlockedMeta.QuotaReason,
			selection.BlockedMeta.QuotaStatus,
			selection.BlockedMeta.CapacityStatus,
		)
		if reason != "" {
			return "no available key: " + reason
		}
	}
	return "no available key"
}

func firstNonEmptyTrimmed(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
