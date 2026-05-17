package relay

import (
	"context"
	"errors"
	"fmt"
	"strings"

	gatewayvalidator "github.com/bestruirui/octopus/internal/gateway/validator"
	transformerModel "github.com/bestruirui/octopus/internal/transformer/model"
)

const streamFirstValidMaxBufferBytes = 64 * 1024

type streamGateChunk struct {
	useEvents bool
	events    []transformerModel.StreamEvent
	internal  *transformerModel.InternalLLMResponse
	size      int
}

func (ra *relayAttempt) decodeStreamGateChunk(ctx context.Context, data string) (streamGateChunk, error) {
	return decodeStreamGateChunk(ctx, data, ra.outAdapter, ra.inAdapter)
}

func decodeStreamGateChunk(ctx context.Context, data string, outAdapter transformerModel.Outbound, inAdapter transformerModel.Inbound) (streamGateChunk, error) {
	if outAdapter == nil {
		return streamGateChunk{}, streamValidationError(gatewayvalidator.ReasonInvalidSSE, "stream transformer unavailable")
	}

	raw := []byte(data)
	if strings.TrimSpace(data) == "[DONE]" {
		return streamGateChunk{internal: &transformerModel.InternalLLMResponse{Object: "[DONE]"}, size: len(raw)}, nil
	}

	outEventAdapter, outOK := outAdapter.(transformerModel.OutboundStreamEventTransformer)
	_, inOK := inAdapter.(transformerModel.InboundStreamEventTransformer)
	if outOK && inOK {
		events, err := outEventAdapter.TransformStreamEvent(ctx, raw)
		if err != nil {
			return streamGateChunk{}, streamValidationDecodeError(err)
		}
		if err := streamEventsValidationError(events); err != nil {
			return streamGateChunk{}, err
		}
		return streamGateChunk{useEvents: true, events: events, size: len(raw)}, nil
	}

	internal, err := outAdapter.TransformStream(ctx, raw)
	if err != nil {
		return streamGateChunk{}, streamValidationDecodeError(err)
	}
	if err := streamInternalValidationError(internal); err != nil {
		return streamGateChunk{}, err
	}
	return streamGateChunk{internal: internal, size: len(raw)}, nil
}

func (ra *relayAttempt) encodeStreamGateChunk(ctx context.Context, chunk streamGateChunk) ([]byte, error) {
	if chunk.useEvents {
		return ra.encodeInboundStreamEvents(ctx, chunk.events)
	}
	if chunk.internal == nil {
		return nil, nil
	}
	return ra.encodeInboundStreamResponse(ctx, chunk.internal)
}

func streamValidationDecodeError(err error) error {
	var responseErr *transformerModel.ResponseError
	if errors.As(err, &responseErr) {
		return streamValidationError(gatewayvalidator.ReasonUpstreamErrorJSON, responseErr.Error())
	}
	return streamValidationError(gatewayvalidator.ReasonInvalidSSE, err.Error())
}

func streamEventsValidationError(events []transformerModel.StreamEvent) error {
	for _, event := range events {
		if event.Kind == transformerModel.StreamEventKindError && event.Error != nil {
			return streamValidationError(gatewayvalidator.ReasonUpstreamErrorJSON, event.Error.Detail.Message)
		}
	}
	return nil
}

func streamInternalValidationError(internal *transformerModel.InternalLLMResponse) error {
	if internal != nil && internal.Error != nil {
		return streamValidationError(gatewayvalidator.ReasonUpstreamErrorJSON, internal.Error.Detail.Message)
	}
	return nil
}

func streamValidationError(reason, detail string) error {
	return &responseValidationError{result: gatewayvalidator.ValidationResult{
		Status:    gatewayvalidator.ValidationRetry,
		Reason:    reason,
		Detail:    detail,
		Retryable: true,
	}}
}

func streamNoValidChunkError() error {
	return streamValidationError(gatewayvalidator.ReasonStreamNoValidChunk, "stream ended before first valid chunk")
}

func streamDoneWithoutContentError() error {
	return streamValidationError(gatewayvalidator.ReasonStreamDoneNoContent, "stream finished before first valid chunk")
}

func streamBufferExceededError(size int) error {
	return streamValidationError(
		gatewayvalidator.ReasonStreamBufferExceeded,
		fmt.Sprintf("buffered=%d max=%d", size, streamFirstValidMaxBufferBytes),
	)
}

func streamChunkHasValidContent(chunk streamGateChunk) bool {
	if chunk.useEvents {
		return streamEventsHaveValidContent(chunk.events)
	}
	return streamInternalHasValidContent(chunk.internal)
}

func streamChunkIsEmpty(chunk streamGateChunk) bool {
	if chunk.useEvents {
		return len(chunk.events) == 0
	}
	return chunk.internal == nil
}

func streamChunkIsDone(chunk streamGateChunk) bool {
	if chunk.useEvents {
		return streamEventsAreDone(chunk.events)
	}
	return chunk.internal != nil && chunk.internal.Object == "[DONE]"
}

func streamEventsAreDone(events []transformerModel.StreamEvent) bool {
	if len(events) != 1 {
		return false
	}
	return events[0].Kind == transformerModel.StreamEventKindDone
}

func streamEventsHaveValidContent(events []transformerModel.StreamEvent) bool {
	for _, event := range events {
		switch event.Kind {
		case transformerModel.StreamEventKindTextDelta:
			if event.Delta != nil && (event.Delta.Text != "" || event.Delta.Refusal != "") {
				return true
			}
		case transformerModel.StreamEventKindToolCallStart, transformerModel.StreamEventKindToolCallDelta:
			if event.ToolCall != nil {
				return true
			}
			if event.Delta != nil && event.Delta.Arguments != "" {
				return true
			}
		case transformerModel.StreamEventKindContentBlockStart:
			if event.ContentBlock != nil && event.ContentBlock.Text != "" {
				return true
			}
		}
	}
	return false
}

func streamInternalHasValidContent(internal *transformerModel.InternalLLMResponse) bool {
	if internal == nil || internal.Object == "[DONE]" || internal.Error != nil {
		return false
	}
	for _, choice := range internal.Choices {
		if choice.Delta == nil {
			continue
		}
		if messageHasValidStreamContent(choice.Delta) {
			return true
		}
	}
	return false
}

func messageHasValidStreamContent(message *transformerModel.Message) bool {
	if message == nil {
		return false
	}
	if message.Content.Content != nil && *message.Content.Content != "" {
		return true
	}
	if message.Refusal != "" {
		return true
	}
	if len(message.ToolCalls) > 0 {
		return true
	}
	return false
}
