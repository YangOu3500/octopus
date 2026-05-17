package validator

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
)

func TestValidateNonStream_OpenAIChat(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		resp   Response
		status ValidationStatus
		reason string
	}{
		{
			name: "valid content",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"choices":[{"message":{"role":"assistant","content":"OK"}}],"usage":{"completion_tokens":1}}`),
			},
			status: ValidationOK,
		},
		{
			name: "missing choices",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"usage":{"completion_tokens":1}}`),
			},
			status: ValidationRetry,
			reason: ReasonMissingChoices,
		},
		{
			name: "empty choices",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"choices":[],"usage":{"completion_tokens":1}}`),
			},
			status: ValidationRetry,
			reason: ReasonEmptyChoices,
		},
		{
			name: "empty content",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"choices":[{"message":{"role":"assistant","content":""}}],"usage":{"completion_tokens":1}}`),
			},
			status: ValidationRetry,
			reason: ReasonEmptyContent,
		},
		{
			name: "empty content with tool calls",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"choices":[{"message":{"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{}"}}]}}],"usage":{"completion_tokens":0}}`),
			},
			status: ValidationOK,
		},
		{
			name: "zero completion tokens",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"choices":[{"message":{"role":"assistant","content":"still bad"}}],"usage":{"completion_tokens":0}}`),
			},
			status: ValidationRetry,
			reason: ReasonZeroCompletionTokens,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := ValidateNonStream(ProviderOpenAIChat, tc.resp)
			if got.Status != tc.status {
				t.Fatalf("status = %q, want %q", got.Status, tc.status)
			}
			if got.Reason != tc.reason {
				t.Fatalf("reason = %q, want %q", got.Reason, tc.reason)
			}
		})
	}
}

func TestValidateNonStream_OpenAIResponses(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		resp   Response
		status ValidationStatus
		reason string
	}{
		{
			name: "valid output text",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}],"usage":{"output_tokens":1}}`),
			},
			status: ValidationOK,
		},
		{
			name: "function call only",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"output":[{"type":"function_call","name":"lookup","arguments":"{}"}],"usage":{"output_tokens":0}}`),
			},
			status: ValidationOK,
		},
		{
			name: "empty output",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"output":[],"usage":{"output_tokens":0}}`),
			},
			status: ValidationRetry,
			reason: ReasonEmptyOutput,
		},
		{
			name: "reasoning only output",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"output":[{"type":"reasoning","summary":[{"type":"summary_text","text":"hidden"}]}],"usage":{"output_tokens":8}}`),
			},
			status: ValidationRetry,
			reason: ReasonNoValidOutput,
		},
		{
			name: "zero output tokens without tool or refusal",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}],"usage":{"output_tokens":0}}`),
			},
			status: ValidationRetry,
			reason: ReasonZeroOutputTokens,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := ValidateNonStream(ProviderOpenAIResponses, tc.resp)
			if got.Status != tc.status {
				t.Fatalf("status = %q, want %q", got.Status, tc.status)
			}
			if got.Reason != tc.reason {
				t.Fatalf("reason = %q, want %q", got.Reason, tc.reason)
			}
		})
	}
}

func TestValidateNonStream_Anthropic(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		resp   Response
		status ValidationStatus
		reason string
	}{
		{
			name: "valid text content",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"text","text":"OK"}],"model":"claude","stop_reason":"end_turn"}`),
			},
			status: ValidationOK,
		},
		{
			name: "tool use only",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"id":"msg_2","type":"message","role":"assistant","content":[{"type":"tool_use","id":"tool_1","name":"lookup","input":{"q":"x"}}],"model":"claude","stop_reason":"tool_use"}`),
			},
			status: ValidationOK,
		},
		{
			name: "empty content",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"id":"msg_3","type":"message","role":"assistant","content":[],"model":"claude"}`),
			},
			status: ValidationRetry,
			reason: ReasonEmptyContent,
		},
		{
			name: "stop without content",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"id":"msg_4","type":"message","role":"assistant","content":[],"model":"claude","stop_reason":"end_turn"}`),
			},
			status: ValidationRetry,
			reason: ReasonStopWithoutContent,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := ValidateNonStream(ProviderAnthropic, tc.resp)
			if got.Status != tc.status {
				t.Fatalf("status = %q, want %q", got.Status, tc.status)
			}
			if got.Reason != tc.reason {
				t.Fatalf("reason = %q, want %q", got.Reason, tc.reason)
			}
		})
	}
}

func TestValidateNonStream_Gemini(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		resp   Response
		status ValidationStatus
		reason string
	}{
		{
			name: "valid text candidate",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"candidates":[{"index":0,"content":{"role":"model","parts":[{"text":"OK"}]}}]}`),
			},
			status: ValidationOK,
		},
		{
			name: "function call candidate",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"candidates":[{"index":0,"content":{"role":"model","parts":[{"functionCall":{"name":"lookup","args":{"q":"x"}}}]}}]}`),
			},
			status: ValidationOK,
		},
		{
			name: "empty candidates",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"candidates":[]}`),
			},
			status: ValidationRetry,
			reason: ReasonEmptyCandidates,
		},
		{
			name: "blocked without valid reply",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"candidates":[],"promptFeedback":{"blockReason":"SAFETY"}}`),
			},
			status: ValidationRetry,
			reason: ReasonBlockedNoValidReply,
		},
		{
			name: "candidate without parts",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"candidates":[{"index":0,"content":{"role":"model","parts":[]}}]}`),
			},
			status: ValidationRetry,
			reason: ReasonCandidateWithoutPart,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := ValidateNonStream(ProviderGemini, tc.resp)
			if got.Status != tc.status {
				t.Fatalf("status = %q, want %q", got.Status, tc.status)
			}
			if got.Reason != tc.reason {
				t.Fatalf("reason = %q, want %q", got.Reason, tc.reason)
			}
		})
	}
}

func TestValidateNonStream_CommonFailures(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		resp   Response
		reason string
	}{
		{
			name: "timeout",
			resp: Response{
				Err: timeoutErr{err: context.DeadlineExceeded},
			},
			reason: ReasonNetworkTimeout,
		},
		{
			name: "rate limit",
			resp: Response{
				StatusCode: http.StatusTooManyRequests,
				Header:     jsonHeader(),
				Body:       []byte(`{"error":{"message":"slow down"}}`),
			},
			reason: ReasonRateLimit,
		},
		{
			name: "server error",
			resp: Response{
				StatusCode: http.StatusBadGateway,
				Header:     jsonHeader(),
				Body:       []byte(`{"error":{"message":"bad gateway"}}`),
			},
			reason: ReasonServerError,
		},
		{
			name: "html login page",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     htmlHeader(),
				Body:       []byte(`<!DOCTYPE html><html><head><title>Login</title></head><body>Please sign in</body></html>`),
			},
			reason: ReasonHTMLOrLoginPage,
		},
		{
			name: "cloudflare page",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     cloudflareHeader(),
				Body:       []byte(`<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body>Cloudflare Ray ID: abc123</body></html>`),
			},
			reason: ReasonCloudflarePage,
		},
		{
			name: "upstream error json",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"error":{"message":"upstream failed","code":"oops"}}`),
			},
			reason: ReasonUpstreamErrorJSON,
		},
		{
			name: "cloudflare fronted upstream error json",
			resp: Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"Content-Type": []string{"application/json"},
					"Server":       []string{"cloudflare"},
					"CF-Ray":       []string{"abc123"},
				},
				Body: []byte(`{"error":{"message":"upstream failed","type":"upstream_error"}}`),
			},
			reason: ReasonUpstreamErrorJSON,
		},
		{
			name: "invalid json",
			resp: Response{
				StatusCode: http.StatusOK,
				Header:     jsonHeader(),
				Body:       []byte(`{"choices":[`),
			},
			reason: ReasonInvalidJSON,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := ValidateNonStream(ProviderOpenAIChat, tc.resp)
			if got.Status != ValidationRetry {
				t.Fatalf("status = %q, want %q", got.Status, ValidationRetry)
			}
			if got.Reason != tc.reason {
				t.Fatalf("reason = %q, want %q", got.Reason, tc.reason)
			}
			if !got.Retryable {
				t.Fatalf("expected retryable result")
			}
		})
	}
}

func TestValidateNonStream_CloudflareHeaderDoesNotFailValidJSON(t *testing.T) {
	t.Parallel()

	got := ValidateNonStream(ProviderOpenAIChat, Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": []string{"application/json"},
			"Server":       []string{"cloudflare"},
			"CF-Ray":       []string{"abc123"},
		},
		Body: []byte(`{"choices":[{"message":{"role":"assistant","content":"OK"}}],"usage":{"completion_tokens":1}}`),
	})
	if got.Status != ValidationOK {
		t.Fatalf("status = %q reason = %q, want ok", got.Status, got.Reason)
	}
}

func TestValidateNonStream_DetailDoesNotEchoBody(t *testing.T) {
	t.Parallel()

	body := []byte(`{"choices":[`)
	got := ValidateNonStream(ProviderOpenAIChat, Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type":  []string{"application/json"},
			"Authorization": []string{"Bearer secret"},
			"Cookie":        []string{"session=secret"},
		},
		Body: body,
		Err:  errors.New("sk-test-should-not-leak"),
	})

	if strings.Contains(got.Detail, "secret") ||
		strings.Contains(got.Detail, "Authorization") ||
		strings.Contains(got.Detail, "Cookie") ||
		strings.Contains(got.Detail, "session") ||
		strings.Contains(got.Detail, "sk-test") {
		t.Fatalf("detail leaked sensitive content: %q", got.Detail)
	}
}

func jsonHeader() http.Header {
	return http.Header{
		"Content-Type": []string{"application/json"},
	}
}

func htmlHeader() http.Header {
	return http.Header{
		"Content-Type": []string{"text/html; charset=utf-8"},
	}
}

func cloudflareHeader() http.Header {
	return http.Header{
		"Content-Type": []string{"text/html; charset=utf-8"},
		"Server":       []string{"cloudflare"},
		"CF-Ray":       []string{"abc123"},
	}
}

type timeoutErr struct {
	err error
}

func (e timeoutErr) Error() string {
	return e.err.Error()
}

func (e timeoutErr) Timeout() bool {
	return true
}

func (e timeoutErr) Temporary() bool {
	return false
}

func (e timeoutErr) Unwrap() error {
	return e.err
}
