package model

const (
	RawDebugDefaultSessionTTLSeconds = 300
	RawDebugDefaultMaxCaptureBytes   = 65536
	RawDebugDefaultRetentionMinutes  = 30
)

type RawDebugConfig struct {
	Enabled             bool `json:"enabled"`
	SessionTTLSeconds   int  `json:"session_ttl_seconds"`
	MaxCaptureBytes     int  `json:"max_capture_bytes"`
	RetentionMinutes    int  `json:"retention_minutes"`
	CaptureRequestBody  bool `json:"capture_request_body"`
	CaptureResponseBody bool `json:"capture_response_body"`
	CaptureHeaders      bool `json:"capture_headers"`
	RedactAuthHeaders   bool `json:"redact_auth_headers"`
}

func DefaultRawDebugConfig() RawDebugConfig {
	return RawDebugConfig{
		Enabled:             false,
		SessionTTLSeconds:   RawDebugDefaultSessionTTLSeconds,
		MaxCaptureBytes:     RawDebugDefaultMaxCaptureBytes,
		RetentionMinutes:    RawDebugDefaultRetentionMinutes,
		CaptureRequestBody:  false,
		CaptureResponseBody: false,
		CaptureHeaders:      false,
		RedactAuthHeaders:   true,
	}
}
