package relay

import (
	dbmodel "github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/relay/balancer"
)

func selectRelayChannelKey(
	channel *dbmodel.Channel,
	iter *balancer.Iterator,
	runtimeState runtimeCandidateState,
	preferredKeyID int,
) (dbmodel.ChannelKey, dbmodel.AttemptCapacityMeta, int) {
	if channel == nil || iter == nil {
		return dbmodel.ChannelKey{}, dbmodel.AttemptCapacityMeta{}, 0
	}

	selectOpts := dbmodel.ChannelKeySelectOptions{
		ExcludeKeyIDs:           make(map[int]struct{}),
		PreferredKeyID:          preferredKeyID,
		SkipUnavailableStatuses: true,
	}

	for {
		selection := channel.SelectChannelKey(selectOpts)
		usedKey := selection.Key
		if usedKey.ChannelKey == "" {
			return dbmodel.ChannelKey{}, selection.BlockedMeta, len(selectOpts.ExcludeKeyIDs)
		}
		if iter.SkipCircuitBreak(channel.ID, usedKey.ID, channel.Name) ||
			iter.SkipHealthCooldownWithScope(channel.ID, usedKey.ID, runtimeState.SiteID, runtimeState.SiteAccountID, channel.Name, channel.GetBaseUrl()) {
			selectOpts.ExcludeKeyIDs[usedKey.ID] = struct{}{}
			continue
		}
		return usedKey, dbmodel.AttemptCapacityMeta{}, len(selectOpts.ExcludeKeyIDs)
	}
}

func relayNoAvailableKeyMeta(meta dbmodel.AttemptCapacityMeta) dbmodel.AttemptCapacityMeta {
	if dbmodel.HasAttemptCapacityMeta(meta) {
		return meta
	}
	return dbmodel.AttemptCapacityMetaForNoAvailableKey()
}
