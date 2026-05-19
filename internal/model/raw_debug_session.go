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
