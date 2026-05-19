package model

type RawDebugSessionStatus string

const (
	RawDebugSessionActive  RawDebugSessionStatus = "active"
	RawDebugSessionRevoked RawDebugSessionStatus = "revoked"
	RawDebugSessionExpired RawDebugSessionStatus = "expired"
)

type RawDebugAuditAction string

const (
	RawDebugAuditActionSessionCreate RawDebugAuditAction = "session_create"
	RawDebugAuditActionSessionRevoke RawDebugAuditAction = "session_revoke"
	RawDebugAuditActionCapture       RawDebugAuditAction = "capture"
	RawDebugAuditActionAccess        RawDebugAuditAction = "access"
	RawDebugAuditActionCopy          RawDebugAuditAction = "copy"
	RawDebugAuditActionExport        RawDebugAuditAction = "export"
)

type RawDebugSession struct {
	ID                  int64                 `json:"id" gorm:"primaryKey;autoIncrement:false"`
	TokenHash           string                `json:"-" gorm:"uniqueIndex;size:64;not null"`
	Status              RawDebugSessionStatus `json:"status" gorm:"index;size:32;not null"`
	ActorUserID         int                   `json:"actor_user_id,omitempty" gorm:"index"`
	ActorName           string                `json:"actor_name,omitempty"`
	Scope               string                `json:"scope,omitempty" gorm:"index"`
	Reason              string                `json:"reason,omitempty"`
	MaxCaptureBytes     int                   `json:"max_capture_bytes"`
	CaptureRequestBody  bool                  `json:"capture_request_body"`
	CaptureResponseBody bool                  `json:"capture_response_body"`
	CaptureHeaders      bool                  `json:"capture_headers"`
	RedactAuthHeaders   bool                  `json:"redact_auth_headers"`
	CreatedAt           int64                 `json:"created_at" gorm:"index"`
	ExpiresAt           int64                 `json:"expires_at" gorm:"index"`
	RevokedAt           int64                 `json:"revoked_at,omitempty" gorm:"index"`
}

type RawDebugAuditEvent struct {
	ID                  int64               `json:"id" gorm:"primaryKey;autoIncrement:false"`
	SessionID           int64               `json:"session_id,omitempty" gorm:"index"`
	ActorUserID         int                 `json:"actor_user_id,omitempty" gorm:"index"`
	ActorName           string              `json:"actor_name,omitempty"`
	Action              RawDebugAuditAction `json:"action" gorm:"index;size:32;not null"`
	TargetType          string              `json:"target_type,omitempty" gorm:"index"`
	TargetID            string              `json:"target_id,omitempty" gorm:"index"`
	Scope               string              `json:"scope,omitempty" gorm:"index"`
	Success             bool                `json:"success" gorm:"index"`
	ErrorSummary        string              `json:"error_summary,omitempty"`
	CaptureRequestBody  bool                `json:"capture_request_body"`
	CaptureResponseBody bool                `json:"capture_response_body"`
	CaptureHeaders      bool                `json:"capture_headers"`
	RedactAuthHeaders   bool                `json:"redact_auth_headers"`
	CreatedAt           int64               `json:"created_at" gorm:"index"`
}

type RawDebugSessionCreateRequest struct {
	ActorUserID int
	ActorName   string
	Scope       string
	Reason      string
}

type RawDebugSessionAuthorization struct {
	Session RawDebugSession `json:"session"`
	Token   string          `json:"token"`
}

type RawDebugSessionListQuery struct {
	Page      int
	PageSize  int
	Status    string
	Scope     string
	ActorName string
	StartTime *int
	EndTime   *int
	SortOrder string
}

type RawDebugSessionListResult struct {
	Items    []RawDebugSession `json:"items"`
	Total    int64             `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	HasMore  bool              `json:"has_more"`
}

type RawDebugAuditListQuery struct {
	Page       int
	PageSize   int
	SessionID  int64
	Action     string
	TargetType string
	Scope      string
	ActorName  string
	Success    *bool
	StartTime  *int
	EndTime    *int
	SortOrder  string
}

type RawDebugAuditListResult struct {
	Items    []RawDebugAuditEvent `json:"items"`
	Total    int64                `json:"total"`
	Page     int                  `json:"page"`
	PageSize int                  `json:"page_size"`
	HasMore  bool                 `json:"has_more"`
}

type RawDebugCapture struct {
	ID                    int64  `json:"id" gorm:"primaryKey;autoIncrement:false"`
	SessionID             int64  `json:"session_id" gorm:"index"`
	TraceID               string `json:"trace_id,omitempty" gorm:"index"`
	RelayLogID            int64  `json:"relay_log_id,omitempty" gorm:"index"`
	APIKeyID              int    `json:"api_key_id,omitempty" gorm:"index"`
	GroupID               int    `json:"group_id,omitempty" gorm:"index"`
	ChannelID             int    `json:"channel_id,omitempty" gorm:"index"`
	ChannelName           string `json:"channel_name,omitempty"`
	RequestModelName      string `json:"request_model_name,omitempty" gorm:"index"`
	ActualModelName       string `json:"actual_model_name,omitempty" gorm:"index"`
	RequestStream         bool   `json:"request_stream,omitempty" gorm:"index"`
	RequestSource         string `json:"request_source,omitempty" gorm:"index"`
	ClientIP              string `json:"client_ip,omitempty" gorm:"index"`
	HTTPStatus            int    `json:"http_status,omitempty" gorm:"index"`
	Success               bool   `json:"success" gorm:"index"`
	ErrorSummary          string `json:"error_summary,omitempty"`
	RequestHeaders        string `json:"request_headers,omitempty" gorm:"type:text"`
	ResponseHeaders       string `json:"response_headers,omitempty" gorm:"type:text"`
	RequestBody           string `json:"request_body,omitempty" gorm:"type:text"`
	ResponseBody          string `json:"response_body,omitempty" gorm:"type:text"`
	RequestBodyTruncated  bool   `json:"request_body_truncated,omitempty"`
	ResponseBodyTruncated bool   `json:"response_body_truncated,omitempty"`
	CreatedAt             int64  `json:"created_at" gorm:"index"`
}

type RawDebugCaptureInput struct {
	Session               RawDebugSession
	RelayLog              RelayLog
	RequestHeaders        map[string][]string
	ResponseHeaders       map[string][]string
	RequestBody           []byte
	ResponseBody          []byte
	RequestBodyTruncated  bool
	ResponseBodyTruncated bool
	HTTPStatus            int
	Success               bool
	ErrorSummary          string
}

type RawDebugCaptureListQuery struct {
	Page       int
	PageSize   int
	SessionID  int64
	TraceID    string
	RelayLogID int64
	Model      string
	Success    *bool
	StartTime  *int
	EndTime    *int
	SortOrder  string
}

type RawDebugCaptureListResult struct {
	Items    []RawDebugCapture `json:"items"`
	Total    int64             `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	HasMore  bool              `json:"has_more"`
}
