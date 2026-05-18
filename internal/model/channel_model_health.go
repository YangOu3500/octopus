package model

type ChannelModelHealthQuery struct {
	TimeRange   string
	ChannelID   int
	Model       string
	Source      string
	QuotaStatus string
}

type ChannelModelHealthResult struct {
	Summary ChannelModelHealthSummary `json:"summary"`
	Rows    []ChannelModelHealthRow   `json:"rows"`
}

type ChannelModelHealthSummary struct {
	TimeRange                 string         `json:"time_range"`
	StartTime                 int64          `json:"start_time"`
	EndTime                   int64          `json:"end_time"`
	HealthScoreEnabled        bool           `json:"health_score_enabled"`
	LoadBalancingStrategy     string         `json:"load_balancing_strategy"`
	ChannelConcurrencyEnabled bool           `json:"channel_concurrency_enabled"`
	ChannelConcurrencyMode    string         `json:"channel_concurrency_mode"`
	ChannelConcurrencyMax     int            `json:"channel_concurrency_max"`
	ChannelConcurrencyLeaseMS int64          `json:"channel_concurrency_lease_ttl_ms"`
	TotalRows                 int            `json:"total_rows"`
	TotalRequests             int            `json:"total_requests"`
	SuccessCount              int            `json:"success_count"`
	FailureCount              int            `json:"failure_count"`
	AvgSuccessRate            float64        `json:"avg_success_rate"`
	AvgHealthScore            float64        `json:"avg_health_score"`
	CoolingDownCount          int            `json:"cooling_down_count"`
	ActiveSelections          int            `json:"active_selections"`
	ChannelConcurrencyActive  int            `json:"channel_concurrency_active"`
	EstimatedCost             float64        `json:"estimated_cost"`
	CapacityBlockedCount      int            `json:"capacity_blocked_count"`
	QuotaStatusCounts         map[string]int `json:"quota_status_counts"`
}

type ChannelModelHealthRow struct {
	ChannelID                int     `json:"channel_id"`
	ChannelName              string  `json:"channel_name"`
	Managed                  bool    `json:"managed"`
	SiteID                   int     `json:"site_id,omitempty"`
	SiteName                 string  `json:"site_name,omitempty"`
	SiteAccountID            int     `json:"site_account_id,omitempty"`
	SiteAccountName          string  `json:"site_account_name,omitempty"`
	ModelName                string  `json:"model_name"`
	RequestCount             int     `json:"request_count"`
	SuccessCount             int     `json:"success_count"`
	FailureCount             int     `json:"failure_count"`
	SuccessRate              float64 `json:"success_rate"`
	RPM                      float64 `json:"rpm"`
	AvgTTFBMS                int     `json:"avg_ttfb_ms"`
	AvgTotalMS               int     `json:"avg_total_ms"`
	TokensPerSecond          float64 `json:"tokens_per_second"`
	InputTokens              int     `json:"input_tokens"`
	OutputTokens             int     `json:"output_tokens"`
	CacheTokens              int     `json:"cache_tokens"`
	EstimatedCost            float64 `json:"estimated_cost"`
	HealthScore              float64 `json:"health_score"`
	HealthSampleCount        int     `json:"health_sample_count"`
	HealthSuccessCount       int     `json:"health_success_count"`
	HealthFailureCount       int     `json:"health_failure_count"`
	HealthSuccessRate        float64 `json:"health_success_rate"`
	EmptyResponseRate        float64 `json:"empty_response_rate"`
	RateLimitCount           int     `json:"rate_limit_count"`
	ActiveSelections         int     `json:"active_selections"`
	ChannelConcurrencyActive int     `json:"channel_concurrency_active"`
	ChannelConcurrencyLimit  int     `json:"channel_concurrency_limit,omitempty"`
	ChannelConcurrencyMode   string  `json:"channel_concurrency_mode,omitempty"`
	CoolingDown              bool    `json:"cooling_down"`
	CooldownRemainingMS      int64   `json:"cooldown_remaining_ms"`
	CooldownReason           string  `json:"cooldown_reason,omitempty"`
	QuotaStatus              string  `json:"quota_status"`
	QuotaReason              string  `json:"quota_reason,omitempty"`
	QuotaBalance             float64 `json:"quota_balance,omitempty"`
	QuotaUsed                float64 `json:"quota_used,omitempty"`
	CapacityStatus           string  `json:"capacity_status,omitempty"`
	CapacityReason           string  `json:"capacity_reason,omitempty"`
	CapacityScope            string  `json:"capacity_scope,omitempty"`
	CapacitySource           string  `json:"capacity_source,omitempty"`
	LastObservedAt           int64   `json:"last_observed_at,omitempty"`
	ExpiresAt                int64   `json:"expires_at,omitempty"`
	LastHTTPStatus           int     `json:"last_http_status,omitempty"`
	LastFailureReason        string  `json:"last_failure_reason,omitempty"`
	LastSeenTime             int64   `json:"last_seen_time,omitempty"`
}
