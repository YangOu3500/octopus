package model

type GroupRoutingPreview struct {
	GroupID            int                     `json:"group_id"`
	GroupName          string                  `json:"group_name"`
	GroupMode          GroupMode               `json:"group_mode"`
	HealthScoreEnabled bool                    `json:"health_score_enabled"`
	Candidates         []GroupRoutingCandidate `json:"candidates"`
}

type GroupRoutingCandidate struct {
	GroupItemID         int      `json:"group_item_id"`
	Rank                int      `json:"rank"`
	ChannelID           int      `json:"channel_id"`
	ChannelName         string   `json:"channel_name"`
	ChannelKeyID        int      `json:"channel_key_id,omitempty"`
	SiteID              int      `json:"site_id,omitempty"`
	SiteName            string   `json:"site_name,omitempty"`
	SiteAccountID       int      `json:"site_account_id,omitempty"`
	SiteAccountName     string   `json:"site_account_name,omitempty"`
	ModelName           string   `json:"model_name"`
	Priority            int      `json:"priority"`
	Weight              int      `json:"weight"`
	Enabled             bool     `json:"enabled"`
	HealthScore         float64  `json:"health_score"`
	SampleCount         int      `json:"sample_count"`
	SuccessCount        int      `json:"success_count"`
	FailureCount        int      `json:"failure_count"`
	SuccessRate         float64  `json:"success_rate"`
	EmptyResponseRate   float64  `json:"empty_response_rate"`
	RateLimitCount      int      `json:"rate_limit_count"`
	AvgTTFBMS           int      `json:"avg_ttfb_ms"`
	AvgTotalMS          int      `json:"avg_total_ms"`
	CoolingDown         bool     `json:"cooling_down"`
	CooldownRemainingMS int64    `json:"cooldown_remaining_ms"`
	CooldownReason      string   `json:"cooldown_reason,omitempty"`
	QuotaStatus         string   `json:"quota_status"`
	QuotaBalance        float64  `json:"quota_balance,omitempty"`
	QuotaUsed           float64  `json:"quota_used,omitempty"`
	EffectiveScore      float64  `json:"effective_score"`
	Decision            string   `json:"decision"`
	Notes               []string `json:"notes,omitempty"`
}
