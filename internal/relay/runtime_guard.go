package relay

import (
	"context"
	"fmt"

	"github.com/bestruirui/octopus/internal/grouphealth"
	dbmodel "github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/relay/balancer"
)

type runtimeCandidateState struct {
	SiteID        int
	SiteAccountID int
	AttemptMeta   dbmodel.AttemptCapacityMeta
}

func evaluateRuntimeCandidateForRelay(ctx context.Context, iter *balancer.Iterator, channel *dbmodel.Channel, modelName string) (runtimeCandidateState, bool) {
	state, err := grouphealth.EvaluateRuntimeCandidate(ctx, *channel, modelName)
	runtimeState := runtimeCandidateState{
		SiteID:        state.SiteID,
		SiteAccountID: state.SiteAccountID,
		AttemptMeta: dbmodel.AttemptCapacityMeta{
			QuotaStatus:    state.QuotaStatus,
			QuotaReason:    state.QuotaReason,
			CapacityStatus: state.CapacityStatus,
			CapacityReason: state.CapacityReason,
			CapacityScope:  state.CapacityScope,
			CapacitySource: state.CapacitySource,
			LastObservedAt: state.LastObservedAt,
			ExpiresAt:      state.ExpiresAt,
		},
	}
	if err != nil {
		iter.Skip(channel.ID, 0, channel.Name, fmt.Sprintf("managed runtime check failed: %v", err))
		return runtimeState, false
	}
	if state.SkipReason != "" {
		iter.SkipWithMeta(channel.ID, 0, channel.Name, state.SkipReason, runtimeState.AttemptMeta)
		return runtimeState, false
	}
	return runtimeState, true
}
