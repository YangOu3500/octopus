package relay

import (
	"strings"
	"testing"

	gatewayvalidator "github.com/bestruirui/octopus/internal/gateway/validator"
	transformerModel "github.com/bestruirui/octopus/internal/transformer/model"
)

func TestStreamInternalHasValidContent(t *testing.T) {
	text := "OK"
	reasoning := "thinking only"

	tests := []struct {
		name     string
		internal *transformerModel.InternalLLMResponse
		want     bool
	}{
		{name: "nil"},
		{name: "done marker", internal: &transformerModel.InternalLLMResponse{Object: "[DONE]"}},
		{name: "empty delta", internal: streamGateInternal(&transformerModel.Message{})},
		{name: "role only delta", internal: streamGateInternal(&transformerModel.Message{Role: "assistant"})},
		{name: "reasoning content only", internal: streamGateInternal(&transformerModel.Message{ReasoningContent: &reasoning})},
		{name: "reasoning field only", internal: streamGateInternal(&transformerModel.Message{Reasoning: &reasoning})},
		{name: "visible content", internal: streamGateInternal(&transformerModel.Message{Content: transformerModel.MessageContent{Content: &text}}), want: true},
		{name: "refusal", internal: streamGateInternal(&transformerModel.Message{Refusal: "blocked"}), want: true},
		{name: "tool call", internal: streamGateInternal(&transformerModel.Message{ToolCalls: []transformerModel.ToolCall{{ID: "call_1"}}}), want: true},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			if got := streamInternalHasValidContent(tc.internal); got != tc.want {
				t.Fatalf("streamInternalHasValidContent() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestStreamEventsHaveValidContent(t *testing.T) {
	tests := []struct {
		name   string
		events []transformerModel.StreamEvent
		want   bool
	}{
		{
			name:   "message start only",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindMessageStart, Role: "assistant"}},
		},
		{
			name:   "thinking only",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindThinkingDelta, Delta: &transformerModel.StreamDelta{Thinking: "thinking only"}}},
		},
		{
			name:   "signature only",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindSignatureDelta, Delta: &transformerModel.StreamDelta{Signature: "sig"}}},
		},
		{
			name:   "usage only",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindUsageDelta, Usage: &transformerModel.Usage{CompletionTokens: 1}}},
		},
		{
			name:   "done only",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindDone}},
		},
		{
			name:   "text delta",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindTextDelta, Delta: &transformerModel.StreamDelta{Text: "OK"}}},
			want:   true,
		},
		{
			name:   "refusal delta",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindTextDelta, Delta: &transformerModel.StreamDelta{Refusal: "blocked"}}},
			want:   true,
		},
		{
			name:   "tool call start",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindToolCallStart, ToolCall: &transformerModel.ToolCall{ID: "call_1"}}},
			want:   true,
		},
		{
			name:   "tool call arguments",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindToolCallDelta, Delta: &transformerModel.StreamDelta{Arguments: `{"q":"x"}`}}},
			want:   true,
		},
		{
			name:   "content block text",
			events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindContentBlockStart, ContentBlock: &transformerModel.StreamContentBlock{Text: "OK"}}},
			want:   true,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			chunk := streamGateChunk{useEvents: true, events: tc.events}
			if got := streamChunkHasValidContent(chunk); got != tc.want {
				t.Fatalf("streamChunkHasValidContent() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestStreamChunkDoneAndEmptyDetection(t *testing.T) {
	if !streamChunkIsDone(streamGateChunk{internal: &transformerModel.InternalLLMResponse{Object: "[DONE]"}}) {
		t.Fatal("expected internal done marker to be detected")
	}
	if !streamChunkIsDone(streamGateChunk{useEvents: true, events: []transformerModel.StreamEvent{{Kind: transformerModel.StreamEventKindDone}}}) {
		t.Fatal("expected event done marker to be detected")
	}
	if !streamChunkIsEmpty(streamGateChunk{}) {
		t.Fatal("expected empty internal chunk to be empty")
	}
	if !streamChunkIsEmpty(streamGateChunk{useEvents: true}) {
		t.Fatal("expected empty event chunk to be empty")
	}
}

func TestStreamValidationErrorReasons(t *testing.T) {
	internalErr := &transformerModel.InternalLLMResponse{
		Error: &transformerModel.ResponseError{Detail: transformerModel.ErrorDetail{Message: "upstream failed"}},
	}
	err := streamInternalValidationError(internalErr)
	assertStreamValidationReason(t, err, gatewayvalidator.ReasonUpstreamErrorJSON)

	events := []transformerModel.StreamEvent{{
		Kind:  transformerModel.StreamEventKindError,
		Error: &transformerModel.ResponseError{Detail: transformerModel.ErrorDetail{Message: "upstream failed"}},
	}}
	err = streamEventsValidationError(events)
	assertStreamValidationReason(t, err, gatewayvalidator.ReasonUpstreamErrorJSON)

	err = streamBufferExceededErrorWithLimit(128, 64)
	assertStreamValidationReason(t, err, gatewayvalidator.ReasonStreamBufferExceeded)
	validationErr := err.(*responseValidationError)
	if !strings.Contains(validationErr.result.Detail, "buffered=128 max=64") {
		t.Fatalf("expected buffer detail in validation result, got %+v", validationErr.result)
	}
}

func streamGateInternal(delta *transformerModel.Message) *transformerModel.InternalLLMResponse {
	return &transformerModel.InternalLLMResponse{
		Choices: []transformerModel.Choice{{Index: 0, Delta: delta}},
	}
}

func assertStreamValidationReason(t *testing.T, err error, reason string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %s error, got nil", reason)
	}
	validationErr, ok := err.(*responseValidationError)
	if !ok {
		t.Fatalf("expected responseValidationError, got %T: %v", err, err)
	}
	if validationErr.result.Reason != reason {
		t.Fatalf("reason = %q, want %q", validationErr.result.Reason, reason)
	}
	if validationErr.result.Status != gatewayvalidator.ValidationRetry || !validationErr.result.Retryable {
		t.Fatalf("unexpected validation result: %+v", validationErr.result)
	}
}
