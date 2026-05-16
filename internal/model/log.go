package model

type AttemptStatus string

const (
	AttemptSuccess      AttemptStatus = "success"
	AttemptFailed       AttemptStatus = "failed"
	AttemptCircuitBreak AttemptStatus = "circuit_break"
	AttemptSkipped      AttemptStatus = "skipped"
)

type ChannelAttempt struct {
	ChannelID        int           `json:"channel_id"`
	ChannelKeyID     int           `json:"channel_key_id,omitempty"`
	KeyID            int           `json:"key_id,omitempty"`
	ChannelName      string        `json:"channel_name"`
	SiteID           int           `json:"site_id,omitempty"`
	SiteAccountID    int           `json:"site_account_id,omitempty"`
	AccountID        int           `json:"account_id,omitempty"`
	BaseURL          string        `json:"base_url,omitempty"`
	ModelName        string        `json:"model_name"`
	UpstreamModel    string        `json:"upstream_model,omitempty"`
	RequestProtocol  string        `json:"request_protocol,omitempty"`
	UpstreamProtocol string        `json:"upstream_protocol,omitempty"`
	ResponseProtocol string        `json:"response_protocol,omitempty"`
	AttemptNum       int           `json:"attempt_num"`
	AttemptIndex     int           `json:"attempt_index,omitempty"`
	Status           AttemptStatus `json:"status"`
	Duration         int           `json:"duration"`
	DurationMS       int           `json:"duration_ms,omitempty"`
	TTFBMS           int           `json:"ttfb_ms,omitempty"`
	TotalMS          int           `json:"total_ms,omitempty"`
	HTTPStatus       int           `json:"http_status,omitempty"`
	FailureReason    string        `json:"failure_reason,omitempty"`
	Retryable        bool          `json:"retryable,omitempty"`
	InputTokens      int           `json:"input_tokens,omitempty"`
	OutputTokens     int           `json:"output_tokens,omitempty"`
	CacheTokens      int           `json:"cache_tokens,omitempty"`
	InputCost        float64       `json:"input_cost,omitempty"`
	OutputCost       float64       `json:"output_cost,omitempty"`
	EstimatedCost    float64       `json:"estimated_cost,omitempty"`
	CostIncurred     string        `json:"cost_incurred,omitempty"`
	CostSource       string        `json:"cost_source,omitempty"`
	ServiceTier      string        `json:"service_tier,omitempty"`
	ErrorSummary     string        `json:"error_summary,omitempty"`
	CreatedAt        int64         `json:"created_at,omitempty"`
	Sticky           bool          `json:"sticky,omitempty"`
	Msg              string        `json:"msg,omitempty"`
}

type RelayLogWSMode string

const (
	RelayLogWSModeFresh        RelayLogWSMode = "fresh"
	RelayLogWSModeContinuation RelayLogWSMode = "continuation"
	RelayLogWSModeReplay       RelayLogWSMode = "replay"
)

type RelayLogWSRecovery string

const (
	RelayLogWSRecoveryReconnect RelayLogWSRecovery = "reconnect"
	RelayLogWSRecoveryReplay    RelayLogWSRecovery = "replay"
	RelayLogWSRecoveryDowngrade RelayLogWSRecovery = "downgrade"
)

type RelayLog struct {
	ID                   int64               `json:"id" gorm:"primaryKey;autoIncrement:false"`
	TraceID              string              `json:"trace_id" gorm:"index"`
	ThreadID             string              `json:"thread_id,omitempty"`
	ClientAPIKeyID       int                 `json:"client_api_key_id,omitempty" gorm:"index"`
	GroupID              int                 `json:"group_id,omitempty" gorm:"index"`
	Time                 int64               `json:"time"`
	RequestModelName     string              `json:"request_model_name"`
	RequestAPIKeyName    string              `json:"request_api_key_name"`
	ChannelId            int                 `json:"channel" gorm:"index"`
	ChannelName          string              `json:"channel_name"`
	ActualModelName      string              `json:"actual_model_name"`
	FinalStatus          string              `json:"final_status,omitempty" gorm:"index"`
	FinalChannelID       int                 `json:"final_channel_id,omitempty"`
	FinalSiteID          int                 `json:"final_site_id,omitempty"`
	FinalUpstreamModel   string              `json:"final_upstream_model,omitempty"`
	AttemptsCount        int                 `json:"attempts_count,omitempty"`
	TotalLatencyMS       int                 `json:"total_latency_ms,omitempty"`
	InputTokens          int                 `json:"input_tokens"`
	TransportInputTokens *int                `json:"transport_input_tokens,omitempty"`
	BillInputTokens      *int                `json:"bill_input_tokens,omitempty"`
	CacheReadTokens      *int                `json:"cache_read_tokens,omitempty"`
	CacheWriteTokens     *int                `json:"cache_write_tokens,omitempty"`
	CacheTokens          int                 `json:"cache_tokens,omitempty"`
	OutputTokens         int                 `json:"output_tokens"`
	Ftut                 int                 `json:"ftut"`
	UseTime              int                 `json:"use_time"`
	Cost                 float64             `json:"cost"`
	EstimatedCost        float64             `json:"estimated_cost,omitempty"`
	FinalSuccessCost     float64             `json:"final_success_cost,omitempty"`
	TotalAttemptCost     float64             `json:"total_attempt_cost,omitempty"`
	FailedAttemptCost    float64             `json:"failed_attempt_estimated_cost,omitempty"`
	ServiceTier          string              `json:"service_tier,omitempty"`
	RequestContent       string              `json:"request_content"`
	ResponseContent      string              `json:"response_content"`
	Error                string              `json:"error"`
	Attempts             []ChannelAttempt    `json:"attempts" gorm:"serializer:json"`
	TotalAttempts        int                 `json:"total_attempts"`
	UsedWS               bool                `json:"used_ws" gorm:"default:false"`
	WSMode               *RelayLogWSMode     `json:"ws_mode,omitempty"`
	WSRecovery           *RelayLogWSRecovery `json:"ws_recovery,omitempty"`
}
