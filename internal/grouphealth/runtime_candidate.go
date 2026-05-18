package grouphealth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

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
	CapacityStatus  string
	CapacityReason  string
	CapacityScope   string
	CapacitySource  string
	LastObservedAt  int64
	ExpiresAt       int64
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

	capacityStatusUnknown   = "unknown"
	capacityStatusAvailable = "available"
	capacityStatusBlocked   = "blocked"
)

func EvaluateRuntimeCandidate(ctx context.Context, channel model.Channel, modelName string) (CandidateRuntimeState, error) {
	state := CandidateRuntimeState{
		QuotaStatus:    quotaStatusUnknown,
		CapacityStatus: capacityStatusUnknown,
		Retryable:      true,
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
			setRuntimeCapacityState(&state, capacityStatusBlocked, state.SkipReason, "site", "site_state", 0, 0)
			state.Retryable = false
			return state, nil
		}
		return state, err
	}
	state.SiteName = site.Name
	if !site.Enabled || site.Archived {
		state.SkipReason = "site_disabled"
		setRuntimeQuotaStatus(&state, quotaStatusSiteDisabled, state.SkipReason)
		setRuntimeCapacityState(&state, capacityStatusBlocked, state.SkipReason, "site", "site_state", 0, 0)
		state.Retryable = false
		return state, nil
	}

	account, err := op.SiteAccountGet(binding.SiteAccountID, ctx)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state.SkipReason = "site_account_missing"
			setRuntimeQuotaStatus(&state, quotaStatusAccountMissing, state.SkipReason)
			setRuntimeCapacityState(&state, capacityStatusBlocked, state.SkipReason, "site_account", "site_account_state", 0, 0)
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
		setRuntimeCapacityState(&state, capacityStatusBlocked, state.SkipReason, "site_account", "site_account_state", siteAccountObservedAt(account), 0)
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
		setRuntimeCapacityState(&state, capacityStatusBlocked, state.SkipReason, "site_model", "site_model_state", siteAccountObservedAt(account), 0)
		state.Retryable = false
		return state, nil
	}

	if account.Balance > 0 {
		setRuntimeQuotaStatus(&state, quotaStatusAvailable, "site_account_balance")
		setRuntimeCapacityState(&state, capacityStatusAvailable, "site_account_balance", "site_account", "site_account_balance", siteAccountObservedAt(account), 0)
		return state, nil
	}
	if account.LastSyncAt != nil || account.BalanceUsed > 0 {
		state.SkipReason = "site_account_zero_balance"
		setRuntimeQuotaStatus(&state, quotaStatusZeroBalance, state.SkipReason)
		setRuntimeCapacityState(&state, capacityStatusBlocked, state.SkipReason, "site_account", "site_account_balance", siteAccountObservedAt(account), 0)
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

func setRuntimeCapacityState(state *CandidateRuntimeState, status, reason, scope, source string, lastObservedAt, expiresAt int64) {
	if state == nil {
		return
	}
	status, reason, scope, source = normalizeCapacitySignal(status, reason, scope, source)
	if status == "" {
		return
	}
	if state.CapacityStatus == "" || capacitySignalPriority(status, source) > capacitySignalPriority(state.CapacityStatus, state.CapacitySource) {
		state.CapacityStatus = status
		state.CapacityReason = reason
		state.CapacityScope = scope
		state.CapacitySource = source
		state.LastObservedAt = lastObservedAt
		state.ExpiresAt = expiresAt
		return
	}
	if capacitySignalPriority(status, source) == capacitySignalPriority(state.CapacityStatus, state.CapacitySource) {
		if state.CapacityReason == "" && reason != "" {
			state.CapacityReason = reason
		}
		if state.CapacityScope == "" && scope != "" {
			state.CapacityScope = scope
		}
		if state.CapacitySource == "" && source != "" {
			state.CapacitySource = source
		}
		if state.LastObservedAt == 0 && lastObservedAt > 0 {
			state.LastObservedAt = lastObservedAt
		}
		if state.ExpiresAt == 0 && expiresAt > 0 {
			state.ExpiresAt = expiresAt
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

func applyCandidateCapacitySignal(candidate *model.GroupRoutingCandidate, status, reason, scope, source string, lastObservedAt, expiresAt int64) {
	if candidate == nil {
		return
	}
	status, reason, scope, source = normalizeCapacitySignal(status, reason, scope, source)
	if status == "" {
		return
	}
	if candidate.CapacityStatus == "" || capacitySignalPriority(status, source) > capacitySignalPriority(candidate.CapacityStatus, candidate.CapacitySource) {
		candidate.CapacityStatus = status
		candidate.CapacityReason = reason
		candidate.CapacityScope = scope
		candidate.CapacitySource = source
		candidate.LastObservedAt = lastObservedAt
		candidate.ExpiresAt = expiresAt
		return
	}
	if capacitySignalPriority(status, source) == capacitySignalPriority(candidate.CapacityStatus, candidate.CapacitySource) {
		if candidate.CapacityReason == "" && reason != "" {
			candidate.CapacityReason = reason
		}
		if candidate.CapacityScope == "" && scope != "" {
			candidate.CapacityScope = scope
		}
		if candidate.CapacitySource == "" && source != "" {
			candidate.CapacitySource = source
		}
		if candidate.LastObservedAt == 0 && lastObservedAt > 0 {
			candidate.LastObservedAt = lastObservedAt
		}
		if candidate.ExpiresAt == 0 && expiresAt > 0 {
			candidate.ExpiresAt = expiresAt
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

func applyChannelModelCapacitySignal(row *model.ChannelModelHealthRow, status, reason, scope, source string, lastObservedAt, expiresAt int64) {
	if row == nil {
		return
	}
	status, reason, scope, source = normalizeCapacitySignal(status, reason, scope, source)
	if status == "" {
		return
	}
	if row.CapacityStatus == "" || capacitySignalPriority(status, source) > capacitySignalPriority(row.CapacityStatus, row.CapacitySource) {
		row.CapacityStatus = status
		row.CapacityReason = reason
		row.CapacityScope = scope
		row.CapacitySource = source
		row.LastObservedAt = lastObservedAt
		row.ExpiresAt = expiresAt
		return
	}
	if capacitySignalPriority(status, source) == capacitySignalPriority(row.CapacityStatus, row.CapacitySource) {
		if row.CapacityReason == "" && reason != "" {
			row.CapacityReason = reason
		}
		if row.CapacityScope == "" && scope != "" {
			row.CapacityScope = scope
		}
		if row.CapacitySource == "" && source != "" {
			row.CapacitySource = source
		}
		if row.LastObservedAt == 0 && lastObservedAt > 0 {
			row.LastObservedAt = lastObservedAt
		}
		if row.ExpiresAt == 0 && expiresAt > 0 {
			row.ExpiresAt = expiresAt
		}
	}
}

func applyCandidateKeyCapacity(candidate *model.GroupRoutingCandidate, key model.ChannelKey) {
	status, reason := quotaStatusFromHTTPStatus(key.StatusCode)
	applyCandidateQuotaStatus(candidate, status, reason)
	if status != "" {
		applyCandidateCapacitySignal(candidate, capacityStatusBlocked, reason, "channel_key", "key_status_code", key.LastUseTimeStamp, 0)
	}
}

func applyChannelModelKeyCapacity(row *model.ChannelModelHealthRow, key model.ChannelKey) {
	status, reason := quotaStatusFromHTTPStatus(key.StatusCode)
	applyChannelModelQuotaStatus(row, status, reason)
	if status != "" {
		applyChannelModelCapacitySignal(row, capacityStatusBlocked, reason, "channel_key", "key_status_code", key.LastUseTimeStamp, 0)
	}
}

func applyCandidateCooldownCapacity(candidate *model.GroupRoutingCandidate, reason string, remainingMS int64) {
	status, quotaReason := quotaStatusFromCooldownReason(reason)
	applyCandidateQuotaStatus(candidate, status, quotaReason)
	if strings.TrimSpace(reason) != "" {
		scope, source := capacityCooldownScopeAndSource(reason)
		applyCandidateCapacitySignal(candidate, capacityStatusBlocked, reason, scope, source, time.Now().Unix(), capacityExpiresAt(remainingMS))
	}
}

func applyChannelModelCooldownCapacity(row *model.ChannelModelHealthRow, reason string, remainingMS int64) {
	status, quotaReason := quotaStatusFromCooldownReason(reason)
	applyChannelModelQuotaStatus(row, status, quotaReason)
	if strings.TrimSpace(reason) != "" {
		scope, source := capacityCooldownScopeAndSource(reason)
		applyChannelModelCapacitySignal(row, capacityStatusBlocked, reason, scope, source, time.Now().Unix(), capacityExpiresAt(remainingMS))
	}
}

func applyCandidateAttemptCapacityMeta(candidate *model.GroupRoutingCandidate, meta model.AttemptCapacityMeta) {
	if candidate == nil || !model.HasAttemptCapacityMeta(meta) {
		return
	}
	applyCandidateQuotaStatus(candidate, meta.QuotaStatus, meta.QuotaReason)
	applyCandidateCapacitySignal(candidate, meta.CapacityStatus, meta.CapacityReason, meta.CapacityScope, meta.CapacitySource, meta.LastObservedAt, meta.ExpiresAt)
}

func applyChannelModelAttemptCapacityMeta(row *model.ChannelModelHealthRow, meta model.AttemptCapacityMeta) {
	if row == nil || !model.HasAttemptCapacityMeta(meta) {
		return
	}
	applyChannelModelQuotaStatus(row, meta.QuotaStatus, meta.QuotaReason)
	applyChannelModelCapacitySignal(row, meta.CapacityStatus, meta.CapacityReason, meta.CapacityScope, meta.CapacitySource, meta.LastObservedAt, meta.ExpiresAt)
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

func normalizeCapacitySignal(status, reason, scope, source string) (string, string, string, string) {
	status = strings.TrimSpace(strings.ToLower(status))
	reason = strings.TrimSpace(strings.ToLower(reason))
	scope = strings.TrimSpace(strings.ToLower(scope))
	source = strings.TrimSpace(strings.ToLower(source))
	switch status {
	case "", capacityStatusUnknown:
		return capacityStatusUnknown, reason, scope, source
	case capacityStatusAvailable, capacityStatusBlocked:
		return status, reason, scope, source
	default:
		return capacityStatusUnknown, reason, scope, source
	}
}

func capacitySignalPriority(status, source string) int {
	status = strings.TrimSpace(strings.ToLower(status))
	source = strings.TrimSpace(strings.ToLower(source))
	switch status {
	case capacityStatusBlocked:
		switch source {
		case "health_cooldown", "circuit_breaker":
			return 95
		case "key_status_code":
			return 90
		case "site_account_balance", "site_account_state", "site_model_state", "site_state":
			return 85
		case "key_selection":
			return 70
		default:
			return 80
		}
	case capacityStatusAvailable:
		return 20
	default:
		return 0
	}
}

func capacityCooldownScopeAndSource(reason string) (string, string) {
	normalized := strings.TrimSpace(strings.ToLower(reason))
	if normalized == "circuit_breaker" {
		return "channel_key", "circuit_breaker"
	}
	return "health", "health_cooldown"
}

func capacityExpiresAt(remainingMS int64) int64 {
	if remainingMS <= 0 {
		return 0
	}
	return time.Now().Add(time.Duration(remainingMS) * time.Millisecond).Unix()
}

func siteAccountObservedAt(account *model.SiteAccount) int64 {
	if account == nil {
		return 0
	}
	if account.LastSyncAt != nil && !account.LastSyncAt.IsZero() {
		return account.LastSyncAt.Unix()
	}
	if account.LastCheckinAt != nil && !account.LastCheckinAt.IsZero() {
		return account.LastCheckinAt.Unix()
	}
	return 0
}
