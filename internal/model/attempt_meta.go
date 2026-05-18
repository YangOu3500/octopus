package model

import (
	"net/http"
	"strings"
	"time"
)

type AttemptCapacityMeta struct {
	QuotaStatus    string
	QuotaReason    string
	CapacityStatus string
	CapacityReason string
	CapacityScope  string
	CapacitySource string
	LastObservedAt int64
	ExpiresAt      int64
}

func (a *ChannelAttempt) ApplyCapacityMeta(meta AttemptCapacityMeta) {
	if a == nil {
		return
	}
	applyAttemptCapacityMeta(
		&a.QuotaStatus,
		&a.QuotaReason,
		&a.CapacityStatus,
		&a.CapacityReason,
		&a.CapacityScope,
		&a.CapacitySource,
		&a.LastObservedAt,
		&a.ExpiresAt,
		meta,
	)
}

func (a *RequestAttempt) ApplyCapacityMeta(meta AttemptCapacityMeta) {
	if a == nil {
		return
	}
	applyAttemptCapacityMeta(
		&a.QuotaStatus,
		&a.QuotaReason,
		&a.CapacityStatus,
		&a.CapacityReason,
		&a.CapacityScope,
		&a.CapacitySource,
		&a.LastObservedAt,
		&a.ExpiresAt,
		meta,
	)
}

func AttemptCapacityMetaFromHTTPStatus(statusCode int, observedAt int64) AttemptCapacityMeta {
	if observedAt <= 0 {
		observedAt = time.Now().Unix()
	}

	switch statusCode {
	case http.StatusPaymentRequired:
		return AttemptCapacityMeta{
			QuotaStatus:    "quota_error",
			QuotaReason:    "http_402",
			CapacityStatus: "blocked",
			CapacityReason: "http_402",
			CapacityScope:  "channel_key",
			CapacitySource: "key_status_code",
			LastObservedAt: observedAt,
		}
	case http.StatusUnauthorized, http.StatusForbidden:
		return AttemptCapacityMeta{
			QuotaStatus:    "auth_error",
			QuotaReason:    "http_auth",
			CapacityStatus: "blocked",
			CapacityReason: "http_auth",
			CapacityScope:  "channel_key",
			CapacitySource: "key_status_code",
			LastObservedAt: observedAt,
		}
	case http.StatusTooManyRequests:
		return AttemptCapacityMeta{
			QuotaStatus:    "rate_limited",
			QuotaReason:    "http_429",
			CapacityStatus: "blocked",
			CapacityReason: "http_429",
			CapacityScope:  "channel_key",
			CapacitySource: "key_status_code",
			LastObservedAt: observedAt,
		}
	default:
		return AttemptCapacityMeta{}
	}
}

func AttemptCapacityMetaForNoAvailableKey() AttemptCapacityMeta {
	return AttemptCapacityMeta{
		QuotaStatus:    "no_key",
		QuotaReason:    "no_available_key",
		CapacityStatus: "blocked",
		CapacityReason: "no_available_key",
		CapacityScope:  "channel_key",
		CapacitySource: "key_selection",
		LastObservedAt: time.Now().Unix(),
	}
}

func AttemptCapacityMetaForCircuitBreak(remaining time.Duration) AttemptCapacityMeta {
	now := time.Now()
	meta := AttemptCapacityMeta{
		CapacityStatus: "blocked",
		CapacityReason: "circuit_breaker_tripped",
		CapacityScope:  "channel_key",
		CapacitySource: "circuit_breaker",
		LastObservedAt: now.Unix(),
	}
	if remaining > 0 {
		meta.ExpiresAt = now.Add(remaining).Unix()
	}
	return meta
}

func AttemptCapacityMetaForCooldown(reason string, remaining time.Duration) AttemptCapacityMeta {
	now := time.Now()
	normalizedReason := strings.TrimSpace(strings.ToLower(reason))
	meta := AttemptCapacityMeta{
		CapacityStatus: "blocked",
		CapacityReason: normalizedReason,
		LastObservedAt: now.Unix(),
	}
	if remaining > 0 {
		meta.ExpiresAt = now.Add(remaining).Unix()
	}

	switch normalizedReason {
	case "quota_error":
		meta.QuotaStatus = "quota_error"
		meta.QuotaReason = normalizedReason
		meta.CapacityScope = "site_account"
		meta.CapacitySource = "health_cooldown_quota"
	case "auth_error":
		meta.QuotaStatus = "auth_error"
		meta.QuotaReason = normalizedReason
		meta.CapacityScope = "channel_key"
		meta.CapacitySource = "health_cooldown_auth"
	case "rate_limit":
		meta.QuotaStatus = "rate_limited"
		meta.QuotaReason = normalizedReason
		meta.CapacityScope = "channel_key"
		meta.CapacitySource = "health_cooldown_rate_limit"
	default:
		meta.CapacityScope = "channel"
		meta.CapacitySource = "health_cooldown"
	}

	return meta
}

func applyAttemptCapacityMeta(
	quotaStatus *string,
	quotaReason *string,
	capacityStatus *string,
	capacityReason *string,
	capacityScope *string,
	capacitySource *string,
	lastObservedAt *int64,
	expiresAt *int64,
	meta AttemptCapacityMeta,
) {
	if quotaStatus != nil && strings.TrimSpace(meta.QuotaStatus) != "" {
		*quotaStatus = strings.TrimSpace(meta.QuotaStatus)
	}
	if quotaReason != nil && strings.TrimSpace(meta.QuotaReason) != "" {
		*quotaReason = strings.TrimSpace(meta.QuotaReason)
	}
	if capacityStatus != nil && strings.TrimSpace(meta.CapacityStatus) != "" {
		*capacityStatus = strings.TrimSpace(meta.CapacityStatus)
	}
	if capacityReason != nil && strings.TrimSpace(meta.CapacityReason) != "" {
		*capacityReason = strings.TrimSpace(meta.CapacityReason)
	}
	if capacityScope != nil && strings.TrimSpace(meta.CapacityScope) != "" {
		*capacityScope = strings.TrimSpace(meta.CapacityScope)
	}
	if capacitySource != nil && strings.TrimSpace(meta.CapacitySource) != "" {
		*capacitySource = strings.TrimSpace(meta.CapacitySource)
	}
	if lastObservedAt != nil && meta.LastObservedAt > 0 {
		*lastObservedAt = meta.LastObservedAt
	}
	if expiresAt != nil && meta.ExpiresAt > 0 {
		*expiresAt = meta.ExpiresAt
	}
}
