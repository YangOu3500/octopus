package grouphealth

import (
	"context"
	"errors"
	"net/http"
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
	QuotaReason     string
	QuotaBalance    float64
	QuotaUsed       float64
	SkipReason      string
	Retryable       bool
}

const (
	quotaStatusUnknown         = "unknown"
	quotaStatusAvailable       = "available"
	quotaStatusNoKey           = "no_key"
	quotaStatusRateLimited     = "rate_limited"
	quotaStatusModelDisabled   = "model_disabled"
	quotaStatusSiteDisabled    = "site_disabled"
	quotaStatusAccountMissing  = "account_missing"
	quotaStatusAuthError       = "auth_error"
	quotaStatusZeroBalance     = "zero_balance"
	quotaStatusQuotaError      = "quota_error"
	quotaStatusAccountDisabled = "account_disabled"
)

func EvaluateRuntimeCandidate(ctx context.Context, channel model.Channel, modelName string) (CandidateRuntimeState, error) {
	state := CandidateRuntimeState{
		QuotaStatus: quotaStatusUnknown,
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
			setRuntimeQuotaStatus(&state, quotaStatusSiteDisabled, state.SkipReason)
			state.Retryable = false
			return state, nil
		}
		return state, err
	}
	state.SiteName = site.Name
	if !site.Enabled || site.Archived {
		state.SkipReason = "site_disabled"
		setRuntimeQuotaStatus(&state, quotaStatusSiteDisabled, state.SkipReason)
		state.Retryable = false
		return state, nil
	}

	account, err := op.SiteAccountGet(binding.SiteAccountID, ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state.SkipReason = "site_account_missing"
			setRuntimeQuotaStatus(&state, quotaStatusAccountMissing, state.SkipReason)
			state.Retryable = false
			return state, nil
		}
		return state, err
	}
	state.SiteAccountName = account.Name
	state.QuotaBalance = account.Balance
	state.QuotaUsed = account.BalanceUsed
	if !account.Enabled {
		state.SkipReason = "site_account_disabled"
		setRuntimeQuotaStatus(&state, quotaStatusAccountDisabled, state.SkipReason)
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
		setRuntimeQuotaStatus(&state, quotaStatusModelDisabled, state.SkipReason)
		state.Retryable = false
		return state, nil
	}

	if account.Balance > 0 {
		setRuntimeQuotaStatus(&state, quotaStatusAvailable, "site_account_balance")
		return state, nil
	}
	if account.LastSyncAt != nil || account.BalanceUsed > 0 {
		state.SkipReason = "site_account_zero_balance"
		setRuntimeQuotaStatus(&state, quotaStatusZeroBalance, state.SkipReason)
		state.Retryable = false
	}
	return state, nil
}

func setRuntimeQuotaStatus(state *CandidateRuntimeState, status, reason string) {
	if state == nil {
		return
	}
	status, reason = normalizeQuotaStatus(status, reason)
	if status == "" {
		return
	}
	if state.QuotaStatus == "" || quotaStatusPriority(status) >= quotaStatusPriority(state.QuotaStatus) {
		state.QuotaStatus = status
		if reason != "" {
			state.QuotaReason = reason
		}
	}
}

func applyCandidateQuotaStatus(candidate *model.GroupRoutingCandidate, status, reason string) {
	if candidate == nil {
		return
	}
	status, reason = normalizeQuotaStatus(status, reason)
	if status == "" {
		return
	}
	if candidate.QuotaStatus == "" || quotaStatusPriority(status) >= quotaStatusPriority(candidate.QuotaStatus) {
		candidate.QuotaStatus = status
		if reason != "" {
			candidate.QuotaReason = reason
		}
	}
}

func applyChannelModelQuotaStatus(row *model.ChannelModelHealthRow, status, reason string) {
	if row == nil {
		return
	}
	status, reason = normalizeQuotaStatus(status, reason)
	if status == "" {
		return
	}
	if row.QuotaStatus == "" || quotaStatusPriority(status) >= quotaStatusPriority(row.QuotaStatus) {
		row.QuotaStatus = status
		if reason != "" {
			row.QuotaReason = reason
		}
	}
}

func applyCandidateKeyCapacity(candidate *model.GroupRoutingCandidate, key model.ChannelKey) {
	status, reason := quotaStatusFromHTTPStatus(key.StatusCode)
	applyCandidateQuotaStatus(candidate, status, reason)
}

func applyChannelModelKeyCapacity(row *model.ChannelModelHealthRow, key model.ChannelKey) {
	status, reason := quotaStatusFromHTTPStatus(key.StatusCode)
	applyChannelModelQuotaStatus(row, status, reason)
}

func applyCandidateCooldownCapacity(candidate *model.GroupRoutingCandidate, reason string) {
	status, quotaReason := quotaStatusFromCooldownReason(reason)
	applyCandidateQuotaStatus(candidate, status, quotaReason)
}

func applyChannelModelCooldownCapacity(row *model.ChannelModelHealthRow, reason string) {
	status, quotaReason := quotaStatusFromCooldownReason(reason)
	applyChannelModelQuotaStatus(row, status, quotaReason)
}

func normalizeQuotaStatus(status, reason string) (string, string) {
	status = strings.TrimSpace(strings.ToLower(status))
	reason = strings.TrimSpace(strings.ToLower(reason))
	switch status {
	case "", quotaStatusUnknown:
		return quotaStatusUnknown, reason
	case quotaStatusAvailable, quotaStatusNoKey, quotaStatusRateLimited, quotaStatusModelDisabled,
		quotaStatusSiteDisabled, quotaStatusAccountMissing, quotaStatusAuthError, quotaStatusZeroBalance,
		quotaStatusQuotaError, quotaStatusAccountDisabled:
		return status, reason
	default:
		return quotaStatusUnknown, reason
	}
}

func quotaStatusPriority(status string) int {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case quotaStatusAccountDisabled:
		return 90
	case quotaStatusQuotaError:
		return 80
	case quotaStatusZeroBalance:
		return 75
	case quotaStatusAuthError:
		return 70
	case quotaStatusAccountMissing:
		return 65
	case quotaStatusSiteDisabled:
		return 60
	case quotaStatusModelDisabled:
		return 50
	case quotaStatusRateLimited:
		return 40
	case quotaStatusNoKey:
		return 30
	case quotaStatusAvailable:
		return 10
	default:
		return 0
	}
}

func quotaStatusFromHTTPStatus(statusCode int) (string, string) {
	switch statusCode {
	case http.StatusPaymentRequired:
		return quotaStatusQuotaError, "http_402"
	case http.StatusUnauthorized, http.StatusForbidden:
		return quotaStatusAuthError, "http_auth"
	case http.StatusTooManyRequests:
		return quotaStatusRateLimited, "http_429"
	default:
		return "", ""
	}
}

func quotaStatusFromCooldownReason(reason string) (string, string) {
	normalized := strings.TrimSpace(strings.ToLower(reason))
	switch normalized {
	case "quota_error":
		return quotaStatusQuotaError, normalized
	case "auth_error":
		return quotaStatusAuthError, normalized
	case "rate_limit":
		return quotaStatusRateLimited, normalized
	}
	if strings.Contains(normalized, "quota") || strings.Contains(normalized, "zero_balance") {
		return quotaStatusQuotaError, "quota_error"
	}
	if strings.Contains(normalized, "auth") || strings.Contains(normalized, "unauthorized") || strings.Contains(normalized, "forbidden") {
		return quotaStatusAuthError, "auth_error"
	}
	if strings.Contains(normalized, "rate_limit") || strings.Contains(normalized, "too_many_requests") {
		return quotaStatusRateLimited, "rate_limit"
	}
	return "", ""
}
