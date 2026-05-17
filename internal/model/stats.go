package model

type StatsMetrics struct {
	InputToken     int64   `json:"input_token" gorm:"bigint"`
	OutputToken    int64   `json:"output_token" gorm:"bigint"`
	InputCost      float64 `json:"input_cost" gorm:"type:real"`
	OutputCost     float64 `json:"output_cost" gorm:"type:real"`
	WaitTime       int64   `json:"wait_time" gorm:"bigint"`
	RequestSuccess int64   `json:"request_success" gorm:"bigint"`
	RequestFailed  int64   `json:"request_failed" gorm:"bigint"`
}

type StatsTotal struct {
	ID int `gorm:"primaryKey"`
	StatsMetrics
}

type StatsHourly struct {
	Hour int    `json:"hour" gorm:"primaryKey"`
	Date string `json:"date" gorm:"not null"` // 记录最后更新日期，格式：20060102
	StatsMetrics
}

type StatsDaily struct {
	Date string `json:"date" gorm:"primaryKey"`
	StatsMetrics
}

type StatsModel struct {
	ID        int    `json:"id" gorm:"primaryKey"`
	Name      string `json:"name" gorm:"not null"`
	ChannelID int    `json:"channel_id" gorm:"not null"`
	StatsMetrics
}

type StatsChannel struct {
	ChannelID int `json:"channel_id" gorm:"primaryKey"`
	StatsMetrics
}

type StatsAPIKey struct {
	APIKeyID int `json:"api_key_id" gorm:"primaryKey"`
	StatsMetrics
}

type StatsObservabilityFailure struct {
	ID            int64  `json:"id"`
	Time          int64  `json:"time"`
	TraceID       string `json:"trace_id,omitempty"`
	RequestModel  string `json:"request_model"`
	UpstreamModel string `json:"upstream_model,omitempty"`
	ChannelID     int    `json:"channel_id,omitempty"`
	ChannelName   string `json:"channel_name,omitempty"`
	HTTPStatus    int    `json:"http_status,omitempty"`
	FailureReason string `json:"failure_reason,omitempty"`
	DurationMS    int    `json:"duration_ms,omitempty"`
	RequestSource string `json:"request_source,omitempty"`
	ClientIP      string `json:"client_ip,omitempty"`
	FinalStatus   string `json:"final_status,omitempty"`
}

type StatsObservabilityBreakdown struct {
	ID           int     `json:"id,omitempty"`
	Name         string  `json:"name"`
	Requests     int     `json:"requests"`
	Failures     int     `json:"failures"`
	SuccessRate  float64 `json:"success_rate"`
	AvgLatencyMS int     `json:"avg_latency_ms,omitempty"`
	Cost         float64 `json:"cost,omitempty"`
}

type StatsObservability struct {
	TimeRange         string                        `json:"time_range"`
	StartTime         int64                         `json:"start_time"`
	EndTime           int64                         `json:"end_time"`
	TotalRequests     int                           `json:"total_requests"`
	SuccessRequests   int                           `json:"success_requests"`
	FailedRequests    int                           `json:"failed_requests"`
	SuccessRate       float64                       `json:"success_rate"`
	FailoverRequests  int                           `json:"failover_requests"`
	FailoverRate      float64                       `json:"failover_rate"`
	AvgTTFBMS         int                           `json:"avg_ttfb_ms"`
	AvgLatencyMS      int                           `json:"avg_latency_ms"`
	RPM               float64                       `json:"rpm"`
	InputTokens       int                           `json:"input_tokens"`
	OutputTokens      int                           `json:"output_tokens"`
	CacheTokens       int                           `json:"cache_tokens"`
	FinalSuccessCost  float64                       `json:"final_success_cost"`
	TotalAttemptCost  float64                       `json:"total_attempt_cost"`
	FailedAttemptCost float64                       `json:"failed_attempt_cost"`
	RecentFailures    []StatsObservabilityFailure   `json:"recent_failures"`
	TopChannels       []StatsObservabilityBreakdown `json:"top_channels"`
	TopModels         []StatsObservabilityBreakdown `json:"top_models"`
}

// StatsSiteModelHourly 站点渠道按小时聚合的请求统计，
// 用于站点渠道页折线图，覆盖任意时间跨度的可用性趋势。
type StatsSiteModelHourly struct {
	Hour          int    `json:"hour" gorm:"primaryKey;autoIncrement:false"`
	SiteAccountID int    `json:"site_account_id" gorm:"primaryKey;index:idx_stats_site_model_lookup"`
	GroupKey      string `json:"group_key" gorm:"primaryKey;type:varchar(128);index:idx_stats_site_model_lookup"`
	ModelName     string `json:"model_name" gorm:"primaryKey;type:varchar(128);index:idx_stats_site_model_lookup"`
	Date          string `json:"date" gorm:"not null;type:varchar(8)"`
	LastRequestAt int64  `json:"last_request_at" gorm:"not null;default:0"`
	StatsMetrics
}

// Add aggregates another StatsMetrics into the current one.
func (s *StatsMetrics) Add(delta StatsMetrics) {
	s.InputToken += delta.InputToken
	s.OutputToken += delta.OutputToken
	s.InputCost += delta.InputCost
	s.OutputCost += delta.OutputCost
	s.WaitTime += delta.WaitTime
	s.RequestSuccess += delta.RequestSuccess
	s.RequestFailed += delta.RequestFailed
}
