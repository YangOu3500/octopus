package relay

import (
	"strings"
	"testing"
)

func TestSanitizeTraceTextRedactsSensitiveValues(t *testing.T) {
	got := sanitizeTraceText("upstream failed: Authorization: Bearer abc.def; x-api-key=sk-real-secret", "upstream_error")
	lower := strings.ToLower(got)
	if strings.Contains(lower, "authorization") || strings.Contains(lower, "x-api-key") {
		t.Fatalf("expected sensitive markers to be redacted, got %q", got)
	}
	if strings.Contains(got, "abc.def") || strings.Contains(got, "sk-real-secret") {
		t.Fatalf("expected sensitive values to be redacted, got %q", got)
	}
	if got != "upstream_error" {
		t.Fatalf("expected fallback reason for sensitive trace text, got %q", got)
	}
}

func TestSanitizeTraceBaseURLDropsCredentialsAndQuery(t *testing.T) {
	got := sanitizeTraceBaseURL("https://user:pass@example.test/v1?api_key=secret&safe=1#frag")
	if got != "https://example.test/v1" {
		t.Fatalf("expected sanitized base url, got %q", got)
	}
}
