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
}

func evaluateRuntimeCandidateForRelay(ctx context.Context, iter *balancer.Iterator, channel *dbmodel.Channel, modelName string) (runtimeCandidateState, bool) {
	state, err := grouphealth.EvaluateRuntimeCandidate(ctx, *channel, modelName)
	runtimeState := runtimeCandidateState{
		SiteID:        state.SiteID,
		SiteAccountID: state.SiteAccountID,
	}
	if err != nil {
		iter.Skip(channel.ID, 0, channel.Name, fmt.Sprintf("managed runtime check failed: %v", err))
		return runtimeState, false
	}
	if state.SkipReason != "" {
		iter.Skip(channel.ID, 0, channel.Name, state.SkipReason)
		return runtimeState, false
	}
	return runtimeState, true
}
