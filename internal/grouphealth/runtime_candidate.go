package grouphealth

import (
	"context"
	"errors"
	"strings"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"gorm.io/gorm"
)

type CandidateRuntimeState struct {
	Managed         bool
	Binding         *model.SiteChannelBinding
	SiteID          int
	SiteName        string
	SiteAccountID   int
	SiteAccountName string
	QuotaStatus     string
	QuotaBalance    float64
	QuotaUsed       float64
	SkipReason      string
	Retryable       bool
}

func EvaluateRuntimeCandidate(ctx context.Context, channel model.Channel, modelName string) (CandidateRuntimeState, error) {
	state := CandidateRuntimeState{
		QuotaStatus: "unknown",
		Retryable:   true,
	}
	if channel.ID <= 0 {
		return state, nil
	}

	binding, managed, err := op.ChannelManagedBinding(channel.ID, ctx)
	if err != nil {
		return state, err
	}
	if !managed || binding == nil {
		return state, nil
	}

	bindingCopy := *binding
	state.Managed = true
	state.Binding = &bindingCopy
	state.SiteID = binding.SiteID
	state.SiteAccountID = binding.SiteAccountID

	site, err := op.SiteGet(binding.SiteID, ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state.SkipReason = "site_missing"
			state.Retryable = false
			return state, nil
		}
		return state, err
	}
	state.SiteName = site.Name
	if !site.Enabled || site.Archived {
		state.SkipReason = "site_disabled"
		state.Retryable = false
		return state, nil
	}

	account, err := op.SiteAccountGet(binding.SiteAccountID, ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state.SkipReason = "site_account_missing"
			state.Retryable = false
			return state, nil
		}
		return state, err
	}
	state.SiteAccountName = account.Name
	state.QuotaBalance = account.Balance
	state.QuotaUsed = account.BalanceUsed
	if !account.Enabled {
		state.QuotaStatus = "account_disabled"
		state.SkipReason = "site_account_disabled"
		state.Retryable = false
		return state, nil
	}

	groupKey, _ := model.ParseSiteChannelBindingKey(binding.GroupKey)
	disabled, err := op.SiteModelIsDisabled(binding.SiteAccountID, groupKey, strings.TrimSpace(modelName), ctx)
	if err != nil {
		return state, err
	}
	if disabled {
		state.SkipReason = "site_model_disabled"
		state.Retryable = false
		return state, nil
	}

	if account.Balance > 0 {
		state.QuotaStatus = "available"
		return state, nil
	}
	if account.LastSyncAt != nil || account.BalanceUsed > 0 {
		state.QuotaStatus = "zero_balance"
		state.SkipReason = "site_account_zero_balance"
		state.Retryable = false
	}
	return state, nil
}
