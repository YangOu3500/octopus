package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	dbmodel "github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/relay/balancer"
	"github.com/bestruirui/octopus/internal/transformer/inbound"
	"github.com/bestruirui/octopus/internal/transformer/model"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
	openaiOutbound "github.com/bestruirui/octopus/internal/transformer/outbound/openai"
	"github.com/bestruirui/octopus/internal/utils/log"
	"github.com/bestruirui/octopus/internal/utils/safe"
	"github.com/coder/websocket"
	"github.com/tmaxmax/go-sse"
)

type streamHeartbeatWriter interface {
	Write([]byte) (int, error)
	Flush()
}

func streamHeartbeatInterval() time.Duration {
	interval, err := op.SettingGetInt(dbmodel.SettingKeySSEHeartbeatInterval)
	if err != nil || interval <= 0 {
		return 0
	}
	return time.Duration(interval) * time.Second
}

func newStreamHeartbeatTicker() (*time.Ticker, <-chan time.Time) {
	interval := streamHeartbeatInterval()
	if interval <= 0 {
		return nil, nil
	}
	ticker := time.NewTicker(interval)
	return ticker, ticker.C
}

func writeSSEHeartbeat(writer streamHeartbeatWriter) error {
	if _, err := writer.Write([]byte(":\n\n")); err != nil {
		return err
	}
	writer.Flush()
	return nil
}

func (ra *relayAttempt) forwardViaWS(ctx context.Context) (int, error) {
	continuation := requiresUpstreamWSContinuation(ra.internalRequest)
	pc := TryUpstreamWS(ctx, ra.channel, ra.channel.GetBaseUrl(), ra.usedKey.ChannelKey, ra.usedKey.ID, ra.clientRequestHeaders())
	if pc == nil {
		log.Debugf("upstream WS unavailable for channel %s (key=%d, continuation=%t)", ra.channel.Name, ra.usedKey.ID, continuation)
		return -1, nil // WS not available
	}

	log.Infof("using upstream WebSocket for channel %s (key=%d)", ra.channel.Name, ra.usedKey.ID)
	log.Debugf("upstream WS selected (channel=%s, key=%d, continuation=%t, previous_response_id=%s)",
		ra.channel.Name, ra.usedKey.ID, continuation, currentPreviousResponseID(ra.internalRequest))

	// Build the Responses API request body
	responsesReq := openaiOutbound.ConvertToResponsesRequest(ra.internalRequest)
	reqBody, err := json.Marshal(responsesReq)
	if err != nil {
		wsUpstreamPool.Put(pc)
		return -1, nil // fall through to HTTP
	}
	ra.metrics.SetTransportRequestPayload(reqBody, ra.internalRequest.Model)

	// Send response.create message
	if err := wsUpstreamPool.SendResponseCreate(ctx, pc, reqBody); err != nil {
		log.Warnf("upstream WS send failed for channel %s: %v", ra.channel.Name, err)
		log.Debugf("upstream WS send failed before stream start (channel=%s, key=%d, continuation=%t, err=%v)",
			ra.channel.Name, ra.usedKey.ID, continuation, err)
		pc.conn.Close(websocket.StatusGoingAway, "send failed")
		wsUpstreamPool.Remove(pc.poolKey)
		if isUpstreamWSConnectionBroken(err) {
			log.Debugf("upstream WS send failure eligible for redial (channel=%s, key=%d, continuation=%t)",
				ra.channel.Name, ra.usedKey.ID, continuation)
			statusCode, redialErr, recovered := ra.retryViaFreshUpstreamWS(ctx, reqBody)
			if recovered || redialErr != nil {
				return statusCode, redialErr
			}
			if requiresUpstreamWSContinuation(ra.internalRequest) {
				balancer.DeleteSticky(ra.apiKeyID, ra.requestModel)
				return http.StatusConflict, fmt.Errorf("upstream continuation transport unavailable; please restart the conversation")
			}
		}
		wsUpstreamPool.RecordWSFailure(ra.channel.ID)
		return -1, nil // fall through to HTTP
	}

	// Read events from WS and process through the transform pipeline
	ra.metrics.UsedWS = true
	ra.metrics.MarkActiveUsedWS()
	if ra.metrics.WSMode == nil {
		ra.metrics.SetWSMode(defaultWSModeForRequest(ra.internalRequest))
	}
	reader := newWSUpstreamReader(pc, ra.channel.ID, ra.usedKey.ID)
	err = ra.handleWSStreamResponse(ctx, reader)
	if err != nil {
		reader.CloseWithError()
		log.Debugf("upstream WS stream failed (channel=%s, key=%d, continuation=%t, written=%t, status=%d, err=%v)",
			ra.channel.Name, ra.usedKey.ID, continuation, ra.getStreamWriter().Written(), reader.StatusCode(), err)
		if requiresUpstreamWSContinuation(ra.internalRequest) && !ra.streamPayloadWritten.Load() && shouldReconnectUpstreamWSBeforeReplay(err) {
			log.Debugf("upstream WS stream failure eligible for reconnect before replay (channel=%s, key=%d, previous_response_id=%s)",
				ra.channel.Name, ra.usedKey.ID, currentPreviousResponseID(ra.internalRequest))
			statusCode, redialErr, recovered := ra.retryViaFreshUpstreamWS(ctx, reqBody)
			if recovered || redialErr != nil {
				return statusCode, redialErr
			}
		}
		if requiresUpstreamWSContinuation(ra.internalRequest) && isContinuationTransportFailure(err) {
			balancer.DeleteSticky(ra.apiKeyID, ra.requestModel)
			return http.StatusConflict, fmt.Errorf("upstream continuation transport unavailable; please restart the conversation")
		}
		if ra.requestContext().Err() == nil {
			wsUpstreamPool.RecordWSFailure(ra.channel.ID)
		}
		return reader.StatusCode(), err
	}

	reader.Close()
	wsUpstreamPool.RecordWSSuccess(ra.channel.ID)
	return 200, nil
}

func (ra *relayAttempt) retryViaFreshUpstreamWS(ctx context.Context, reqBody []byte) (int, error, bool) {
	log.Debugf("attempting fresh upstream WS redial (channel=%s, key=%d, previous_response_id=%s)",
		ra.channel.Name, ra.usedKey.ID, currentPreviousResponseID(ra.internalRequest))
	redialed := TryUpstreamWS(ctx, ra.channel, ra.channel.GetBaseUrl(), ra.usedKey.ChannelKey, ra.usedKey.ID, ra.clientRequestHeaders(), true)
	if redialed == nil {
		log.Debugf("fresh upstream WS redial unavailable (channel=%s, key=%d)", ra.channel.Name, ra.usedKey.ID)
		return 0, nil, false
	}

	retryErr := wsUpstreamPool.SendResponseCreate(ctx, redialed, reqBody)
	if retryErr != nil {
		log.Warnf("upstream WS redial send failed for channel %s: %v", ra.channel.Name, retryErr)
		log.Debugf("fresh upstream WS redial send failed (channel=%s, key=%d, err=%v)", ra.channel.Name, ra.usedKey.ID, retryErr)
		redialed.conn.Close(websocket.StatusGoingAway, "send failed after redial")
		wsUpstreamPool.Remove(redialed.poolKey)
		wsUpstreamPool.RecordWSFailure(ra.channel.ID)
		if requiresUpstreamWSContinuation(ra.internalRequest) {
			balancer.DeleteSticky(ra.apiKeyID, ra.requestModel)
			return http.StatusConflict, fmt.Errorf("upstream continuation transport unavailable; please restart the conversation"), true
		}
		return -1, nil, true
	}

	ra.metrics.UsedWS = true
	ra.metrics.MarkActiveUsedWS()
	if ra.metrics.WSMode == nil {
		ra.metrics.SetWSMode(defaultWSModeForRequest(ra.internalRequest))
	}
	ra.metrics.SetWSRecovery(dbmodel.RelayLogWSRecoveryReconnect)
	reader := newWSUpstreamReader(redialed, ra.channel.ID, ra.usedKey.ID)
	streamErr := ra.handleWSStreamResponse(ctx, reader)
	if streamErr != nil {
		reader.CloseWithError()
		log.Debugf("fresh upstream WS redial stream failed (channel=%s, key=%d, status=%d, err=%v)",
			ra.channel.Name, ra.usedKey.ID, reader.StatusCode(), streamErr)
		if requiresUpstreamWSContinuation(ra.internalRequest) && isContinuationTransportFailure(streamErr) {
			balancer.DeleteSticky(ra.apiKeyID, ra.requestModel)
			return http.StatusConflict, fmt.Errorf("upstream continuation transport unavailable; please restart the conversation"), true
		}
		if ra.requestContext().Err() == nil {
			wsUpstreamPool.RecordWSFailure(ra.channel.ID)
		}
		return reader.StatusCode(), streamErr, true
	}
	log.Debugf("fresh upstream WS redial succeeded (channel=%s, key=%d, previous_response_id=%s)",
		ra.channel.Name, ra.usedKey.ID, currentPreviousResponseID(ra.internalRequest))
	reader.Close()
	wsUpstreamPool.RecordWSSuccess(ra.channel.ID)
	return http.StatusOK, nil, true
}

func isContinuationTransportFailure(err error) bool {
	message := relayErrorMessage(err)
	return isUpstreamWSConnectionBroken(err) ||
		needsConversationRestart(message) ||
		strings.Contains(message, "ws stream ended before first event")
}

func (ra *relayAttempt) clientRequestHeaders() http.Header {
	if ra == nil || ra.c == nil || ra.c.Request == nil {
		return nil
	}
	return ra.c.Request.Header
}

// handleWSStreamResponse processes events from an upstream WebSocket reader.
func (ra *relayAttempt) handleWSStreamResponse(ctx context.Context, reader UpstreamReader) error {
	gateConfig := ra.resolvedStreamGateConfig()
	// 交接早期心跳给本函数内层 ticker
	ra.heartbeat.Hand()

	// Determine client writer
	writer := ra.getStreamWriter()

	// Set SSE response headers (for HTTP clients; WS clients handle this differently)
	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.Header().Set("Connection", "keep-alive")
	writer.Header().Set("X-Accel-Buffering", "no")

	heartbeatTicker, heartbeatC := newStreamHeartbeatTicker()
	if heartbeatTicker != nil {
		defer heartbeatTicker.Stop()
	}

	firstToken := true
	var firstTokenTimer *time.Timer
	var firstTokenC <-chan time.Time
	if gateConfig.firstValidTimeoutSec > 0 {
		firstTokenTimer = time.NewTimer(time.Duration(gateConfig.firstValidTimeoutSec) * time.Second)
		firstTokenC = firstTokenTimer.C
		defer func() {
			if firstTokenTimer != nil {
				firstTokenTimer.Stop()
			}
		}()
	}

	// 异步读取上游 WS 事件，使主循环可以与 heartbeat/ctx/firstToken 并行 select
	type wsReadResult struct {
		data []byte
		err  error
	}
	results := make(chan wsReadResult, 1)
	safe.Go("relay-ws-stream-read", func() {
		defer close(results)
		for {
			eventData, err := reader.ReadEvent(ctx)
			results <- wsReadResult{data: eventData, err: err}
			if err != nil {
				return
			}
		}
	})

	for {
		select {
		case <-ctx.Done():
			if isLocalRelayBudgetExceeded(ctx, contextError(ctx)) {
				return contextError(ctx)
			}
			log.Infof("client disconnected during ws stream")
			return nil
		case <-firstTokenC:
			log.Warnf("first token timeout (%ds) on ws stream, switching channel", gateConfig.firstValidTimeoutSec)
			return fmt.Errorf("first token timeout (%ds)", gateConfig.firstValidTimeoutSec)
		case <-heartbeatC:
			if err := writeSSEHeartbeat(writer); err != nil {
				return err
			}
		case r, ok := <-results:
			if !ok {
				if firstToken {
					return fmt.Errorf("ws stream ended before first event")
				}
				log.Infof("ws stream end")
				return nil
			}
			if r.err != nil {
				if r.err == io.EOF {
					if firstToken {
						return fmt.Errorf("ws stream ended before first event")
					}
					log.Infof("ws stream end")
					return nil
				}
				return fmt.Errorf("ws stream read error: %w", r.err)
			}

			// Transform through outbound → internal → inbound pipeline
			ra.metrics.AppendRawDebugResponsePayload(append(append([]byte(nil), r.data...), '\n'), reader.Headers(), reader.StatusCode())
			data, err := ra.transformStreamData(ctx, string(r.data))
			if err != nil || len(data) == 0 {
				continue
			}

			if firstToken {
				ra.metrics.SetFirstTokenTime(time.Now())
				firstToken = false
				if firstTokenTimer != nil {
					if !firstTokenTimer.Stop() {
						select {
						case <-firstTokenTimer.C:
						default:
						}
					}
					firstTokenTimer = nil
					firstTokenC = nil
				}
			}

			ra.streamPayloadWritten.Store(true)
			writer.Write(data)
			writer.Flush()
		}
	}
}

// forwardViaHTTP forwards the request using traditional HTTP.

func defaultWSModeForRequest(req *model.InternalLLMRequest) dbmodel.RelayLogWSMode {
	if requiresUpstreamWSContinuation(req) {
		return dbmodel.RelayLogWSModeContinuation
	}
	return dbmodel.RelayLogWSModeFresh
}

func (ra *relayAttempt) getStreamWriter() StreamWriter {
	if ra.streamWriter != nil {
		return ra.streamWriter
	}
	return ra.c.Writer
}

func (ra *relayAttempt) handleStreamResponse(ctx context.Context, response *http.Response) error {
	gateConfig := ra.resolvedStreamGateConfig()
	if ct := response.Header.Get("Content-Type"); ct != "" && !strings.Contains(strings.ToLower(ct), "text/event-stream") {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 16*1024))
		return fmt.Errorf("upstream returned non-SSE content-type %q for stream request: %s", ct, string(body))
	}

	// 交接早期心跳给本函数内层 ticker，避免双路 flush 竞争
	ra.heartbeat.Hand()

	writer := ra.getStreamWriter()

	// 设置 SSE 响应头
	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.Header().Set("Connection", "keep-alive")
	writer.Header().Set("X-Accel-Buffering", "no")

	heartbeatTicker, heartbeatC := newStreamHeartbeatTicker()
	if heartbeatTicker != nil {
		defer heartbeatTicker.Stop()
	}

	firstToken := true

	type sseReadResult struct {
		data string
		err  error
	}
	results := make(chan sseReadResult, 1)
	safe.Go("relay-stream-read", func() {
		defer close(results)
		readCfg := &sse.ReadConfig{MaxEventSize: maxSSEEventSize}
		for ev, err := range sse.Read(response.Body, readCfg) {
			if err != nil {
				results <- sseReadResult{err: err}
				return
			}
			results <- sseReadResult{data: ev.Data}
		}
	})

	var firstTokenTimer *time.Timer
	var firstTokenC <-chan time.Time
	if firstToken && gateConfig.firstValidTimeoutSec > 0 {
		firstTokenTimer = time.NewTimer(time.Duration(gateConfig.firstValidTimeoutSec) * time.Second)
		firstTokenC = firstTokenTimer.C
		defer func() {
			if firstTokenTimer != nil {
				firstTokenTimer.Stop()
			}
		}()
	}

	var bufferedChunks []streamGateChunk
	bufferedSize := 0

	for {
		select {
		case <-ctx.Done():
			err := contextError(ctx)
			if isLocalRelayBudgetExceeded(ctx, err) {
				return err
			}
			log.Infof("client disconnected, stopping stream: written=%t first_token_seen=%t elapsed=%s", ra.streamPayloadWritten.Load(), !firstToken, time.Since(ra.metrics.StartTime))
			return err
		case <-firstTokenC:
			log.Warnf("first token timeout (%ds), switching channel", gateConfig.firstValidTimeoutSec)
			_ = response.Body.Close()
			return fmt.Errorf("first token timeout (%ds)", gateConfig.firstValidTimeoutSec)
		case <-heartbeatC:
			if firstToken {
				continue
			}
			if err := writeSSEHeartbeat(writer); err != nil {
				return err
			}
		case r, ok := <-results:
			if !ok {
				if firstToken {
					return streamNoValidChunkError()
				}
				log.Infof("stream end")
				return nil
			}
			if r.err != nil {
				log.Warnf("failed to read event: %v", r.err)
				if !gateConfig.invalidSSEAsFailure && firstToken {
					continue
				}
				return streamValidationDecodeError(r.err)
			}
			ra.metrics.AppendRawDebugResponsePayload([]byte("data: "+r.data+"\n\n"), response.Header, response.StatusCode)

			if firstToken {
				chunk, err := ra.decodeStreamGateChunk(ctx, r.data)
				if err != nil {
					log.Warnf("first valid chunk gate rejected stream from channel %s: %v", ra.channel.Name, err)
					if !gateConfig.invalidSSEAsFailure {
						continue
					}
					return err
				}
				if streamChunkIsDone(chunk) {
					if !gateConfig.emptyDoneAsFailure {
						data, err := ra.encodeStreamGateChunk(ctx, chunk)
						if err != nil {
							return err
						}
						if len(data) > 0 {
							ra.streamPayloadWritten.Store(true)
							if _, err := ra.getStreamWriter().Write(data); err != nil {
								return err
							}
							ra.getStreamWriter().Flush()
						}
						ra.metrics.SetFirstTokenTime(time.Now())
						return nil
					}
					return streamDoneWithoutContentError()
				}
				if !streamChunkIsEmpty(chunk) {
					bufferedChunks = append(bufferedChunks, chunk)
					bufferedSize += chunk.size
					if bufferedSize > gateConfig.maxBufferBytes {
						return streamBufferExceededErrorWithLimit(bufferedSize, gateConfig.maxBufferBytes)
					}
				}
				if !streamChunkHasValidContent(chunk) {
					continue
				}
				wrote := false
				for _, buffered := range bufferedChunks {
					data, err := ra.encodeStreamGateChunk(ctx, buffered)
					if err != nil {
						return err
					}
					if len(data) == 0 {
						continue
					}
					ra.streamPayloadWritten.Store(true)
					if _, err := ra.getStreamWriter().Write(data); err != nil {
						return err
					}
					wrote = true
				}
				if !wrote {
					continue
				}
				ra.metrics.SetFirstTokenTime(time.Now())
				firstToken = false
				bufferedChunks = nil
				if firstTokenTimer != nil {
					if !firstTokenTimer.Stop() {
						select {
						case <-firstTokenTimer.C:
						default:
						}
					}
					firstTokenTimer = nil
					firstTokenC = nil
				}
				ra.getStreamWriter().Flush()
				continue
			}

			data, err := ra.transformStreamData(ctx, r.data)
			if err != nil || len(data) == 0 {
				continue
			}
			ra.streamPayloadWritten.Store(true)
			ra.getStreamWriter().Write(data)
			ra.getStreamWriter().Flush()
		}
	}
}

type passthroughStreamGateResult struct {
	raw []byte
	err error
}

func (ra *relayAttempt) waitForPassthroughFirstValidChunk(ctx context.Context, response *http.Response, outAdapter model.Outbound, inAdapter model.Inbound) ([]byte, error) {
	gateConfig := ra.resolvedStreamGateConfig()
	results := make(chan passthroughStreamGateResult, 1)
	safe.Go("relay-passthrough-first-valid-gate", func() {
		var raw bytes.Buffer
		tee := io.TeeReader(response.Body, &raw)
		readCfg := &sse.ReadConfig{MaxEventSize: maxSSEEventSize}
		for ev, err := range sse.Read(tee, readCfg) {
			if err != nil {
				results <- passthroughStreamGateResult{err: streamValidationDecodeError(err)}
				return
			}
			if raw.Len() > gateConfig.maxBufferBytes {
				results <- passthroughStreamGateResult{err: streamBufferExceededErrorWithLimit(raw.Len(), gateConfig.maxBufferBytes)}
				return
			}

			chunk, err := decodeStreamGateChunk(ctx, ev.Data, outAdapter, inAdapter)
			if err != nil {
				if !gateConfig.invalidSSEAsFailure {
					continue
				}
				results <- passthroughStreamGateResult{err: err}
				return
			}
			if streamChunkIsDone(chunk) {
				if !gateConfig.emptyDoneAsFailure {
					results <- passthroughStreamGateResult{raw: append([]byte(nil), raw.Bytes()...)}
					return
				}
				results <- passthroughStreamGateResult{err: streamDoneWithoutContentError()}
				return
			}
			if !streamChunkHasValidContent(chunk) {
				continue
			}

			results <- passthroughStreamGateResult{raw: append([]byte(nil), raw.Bytes()...)}
			return
		}
		if raw.Len() > gateConfig.maxBufferBytes {
			results <- passthroughStreamGateResult{err: streamBufferExceededErrorWithLimit(raw.Len(), gateConfig.maxBufferBytes)}
			return
		}
		results <- passthroughStreamGateResult{err: streamNoValidChunkError()}
	})

	var firstTokenTimer *time.Timer
	var firstTokenC <-chan time.Time
	if gateConfig.firstValidTimeoutSec > 0 {
		firstTokenTimer = time.NewTimer(time.Duration(gateConfig.firstValidTimeoutSec) * time.Second)
		firstTokenC = firstTokenTimer.C
		defer firstTokenTimer.Stop()
	}

	select {
	case <-ctx.Done():
		_ = response.Body.Close()
		return nil, contextError(ctx)
	case <-firstTokenC:
		log.Warnf("first token timeout (%ds), switching channel", gateConfig.firstValidTimeoutSec)
		_ = response.Body.Close()
		return nil, fmt.Errorf("first token timeout (%ds)", gateConfig.firstValidTimeoutSec)
	case result := <-results:
		if result.err != nil {
			return nil, result.err
		}
		return result.raw, nil
	}
}

// transformStreamData 转换流式数据
func (ra *relayAttempt) transformStreamData(ctx context.Context, data string) ([]byte, error) {
	events, ok, err := ra.decodeOutboundStreamEvents(ctx, []byte(data))
	if err != nil {
		log.Warnf("failed to transform stream events: %v", err)
		return nil, err
	}
	if ok {
		return ra.encodeInboundStreamEvents(ctx, events)
	}

	internalStream, err := ra.decodeOutboundStreamResponse(ctx, []byte(data))
	if err != nil {
		log.Warnf("failed to transform stream: %v", err)
		return nil, err
	}
	if internalStream == nil {
		return nil, nil
	}

	return ra.encodeInboundStreamResponse(ctx, internalStream)
}

func (ra *relayAttempt) decodeOutboundStreamEvents(ctx context.Context, data []byte) ([]model.StreamEvent, bool, error) {
	outEventAdapter, ok := ra.outAdapter.(model.OutboundStreamEventTransformer)
	if !ok {
		return nil, false, nil
	}
	if _, ok := ra.inAdapter.(model.InboundStreamEventTransformer); !ok {
		return nil, false, nil
	}
	events, err := outEventAdapter.TransformStreamEvent(ctx, data)
	if err != nil {
		return nil, true, err
	}
	return events, true, nil
}

func (ra *relayAttempt) encodeInboundStreamEvents(ctx context.Context, events []model.StreamEvent) ([]byte, error) {
	if len(events) == 0 {
		return nil, nil
	}
	inEventAdapter, ok := ra.inAdapter.(model.InboundStreamEventTransformer)
	if !ok {
		return nil, nil
	}
	inStream, err := inEventAdapter.TransformStreamEvents(ctx, events)
	if err != nil {
		log.Warnf("failed to transform inbound stream events: %v", err)
		return nil, err
	}
	return inStream, nil
}

func (ra *relayAttempt) decodeOutboundStreamResponse(ctx context.Context, data []byte) (*model.InternalLLMResponse, error) {
	return ra.outAdapter.TransformStream(ctx, data)
}

func (ra *relayAttempt) encodeInboundStreamResponse(ctx context.Context, internalStream *model.InternalLLMResponse) ([]byte, error) {
	inStream, err := ra.inAdapter.TransformStream(ctx, internalStream)
	if err != nil {
		log.Warnf("failed to transform stream: %v", err)
		return nil, err
	}
	return inStream, nil
}

func (ra *relayAttempt) handleStreamResponsePassthroughOpenAIResponses(ctx context.Context, response *http.Response) error {
	if ct := response.Header.Get("Content-Type"); ct != "" && !strings.Contains(strings.ToLower(ct), "text/event-stream") {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 16*1024))
		return fmt.Errorf("upstream returned non-SSE content-type %q for stream request: %s", ct, string(body))
	}

	// 交接早期心跳给本函数内层 ticker
	ra.heartbeat.Hand()

	writer := ra.getStreamWriter()
	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.Header().Set("Connection", "keep-alive")
	writer.Header().Set("X-Accel-Buffering", "no")

	gateOut := outbound.Get(outbound.OutboundTypeOpenAIResponse)
	gateIn := inbound.Get(inbound.InboundTypeOpenAIResponse)
	prefix, err := ra.waitForPassthroughFirstValidChunk(ctx, response, gateOut, gateIn)
	if err != nil {
		log.Warnf("first valid chunk gate rejected openai responses stream from channel %s: %v", ra.channel.Name, err)
		return err
	}

	var rawStream bytes.Buffer
	if len(prefix) > 0 {
		if _, werr := writer.Write(prefix); werr != nil {
			return werr
		}
		ra.streamPayloadWritten.Store(true)
		_, _ = rawStream.Write(prefix)
		writer.Flush()
		ra.metrics.SetFirstTokenTime(time.Now())
	}

	type rawReadResult struct {
		chunk []byte
		err   error
	}
	results := make(chan rawReadResult, 1)
	safe.Go("relay-stream-read", func() {
		defer close(results)
		buf := make([]byte, 32*1024)
		for {
			n, err := response.Body.Read(buf)
			if n > 0 {
				chunk := append([]byte(nil), buf[:n]...)
				results <- rawReadResult{chunk: chunk}
			}
			if err != nil {
				results <- rawReadResult{err: err}
				return
			}
		}
	})

	heartbeatTicker, heartbeatC := newStreamHeartbeatTicker()
	if heartbeatTicker != nil {
		defer heartbeatTicker.Stop()
	}

	for {
		select {
		case <-ctx.Done():
			err := contextError(ctx)
			if isLocalRelayBudgetExceeded(ctx, err) {
				return err
			}
			log.Infof("client disconnected, stopping stream: written=%t raw_bytes=%d first_token_seen=%t elapsed=%s", ra.streamPayloadWritten.Load(), rawStream.Len(), true, time.Since(ra.metrics.StartTime))
			if rawStream.Len() > 0 {
				ra.collectOpenAIResponsesPassthroughMetrics(context.Background(), rawStream.Bytes())
			}
			return err
		case <-heartbeatC:
			if err := writeSSEHeartbeat(writer); err != nil {
				return err
			}
		case r, ok := <-results:
			if !ok {
				ra.metrics.SetRawDebugResponsePayload(rawStream.Bytes(), response.Header, response.StatusCode)
				ra.collectOpenAIResponsesPassthroughMetrics(ctx, rawStream.Bytes())
				log.Infof("stream end")
				return nil
			}
			if r.err != nil {
				if r.err == io.EOF {
					ra.metrics.SetRawDebugResponsePayload(rawStream.Bytes(), response.Header, response.StatusCode)
					ra.collectOpenAIResponsesPassthroughMetrics(ctx, rawStream.Bytes())
					log.Infof("stream end")
					return nil
				}
				log.Warnf("failed to read event: %v", r.err)
				return fmt.Errorf("failed to read stream event: %w", r.err)
			}
			if len(r.chunk) == 0 {
				continue
			}
			if _, werr := writer.Write(r.chunk); werr != nil {
				return werr
			}
			ra.streamPayloadWritten.Store(true)
			_, _ = rawStream.Write(r.chunk)
			writer.Flush()
		}
	}
}

func (ra *relayAttempt) collectOpenAIResponsesPassthroughMetrics(ctx context.Context, rawStream []byte) {
	if len(rawStream) == 0 {
		return
	}
	outEventAdapter, outOk := ra.outAdapter.(model.OutboundStreamEventTransformer)
	inEventAdapter, inOk := ra.inAdapter.(model.InboundStreamEventTransformer)
	if outOk && inOk {
		readCfg := &sse.ReadConfig{MaxEventSize: maxSSEEventSize}
		for ev, err := range sse.Read(bytes.NewReader(rawStream), readCfg) {
			if err != nil {
				log.Debugf("openai responses passthrough metrics parse skipped: %v", err)
				return
			}
			if events, terr := outEventAdapter.TransformStreamEvent(ctx, []byte(ev.Data)); terr == nil && len(events) > 0 {
				_, _ = inEventAdapter.TransformStreamEvents(ctx, events)
			}
		}
		return
	}
	readCfg := &sse.ReadConfig{MaxEventSize: maxSSEEventSize}
	for ev, err := range sse.Read(bytes.NewReader(rawStream), readCfg) {
		if err != nil {
			log.Debugf("openai responses passthrough metrics parse skipped: %v", err)
			return
		}
		if internalStream, terr := ra.outAdapter.TransformStream(ctx, []byte(ev.Data)); terr == nil && internalStream != nil {
			_, _ = ra.inAdapter.TransformStream(ctx, internalStream)
		}
	}
}

func (ra *relayAttempt) handleStreamResponsePassthroughAnthropic(ctx context.Context, response *http.Response) error {
	if ct := response.Header.Get("Content-Type"); ct != "" && !strings.Contains(strings.ToLower(ct), "text/event-stream") {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 16*1024))
		return fmt.Errorf("upstream returned non-SSE content-type %q for stream request: %s", ct, string(body))
	}

	// 交接早期心跳给本函数内层 ticker
	ra.heartbeat.Hand()

	writer := ra.getStreamWriter()

	// 设置 SSE 响应头
	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	writer.Header().Set("Connection", "keep-alive")
	writer.Header().Set("X-Accel-Buffering", "no")

	gateOut := outbound.Get(outbound.OutboundTypeAnthropic)
	gateIn := inbound.Get(inbound.InboundTypeAnthropic)
	prefix, err := ra.waitForPassthroughFirstValidChunk(ctx, response, gateOut, gateIn)
	if err != nil {
		log.Warnf("first valid chunk gate rejected anthropic stream from channel %s: %v", ra.channel.Name, err)
		return err
	}

	var rawStream bytes.Buffer
	if len(prefix) > 0 {
		if _, werr := writer.Write(prefix); werr != nil {
			return werr
		}
		ra.streamPayloadWritten.Store(true)
		_, _ = rawStream.Write(prefix)
		writer.Flush()
		ra.metrics.SetFirstTokenTime(time.Now())
	}

	type rawReadResult struct {
		chunk []byte
		err   error
	}
	results := make(chan rawReadResult, 1)
	safe.Go("relay-stream-read", func() {
		defer close(results)
		buf := make([]byte, 32*1024)
		for {
			n, err := response.Body.Read(buf)
			if n > 0 {
				chunk := append([]byte(nil), buf[:n]...)
				results <- rawReadResult{chunk: chunk}
			}
			if err != nil {
				results <- rawReadResult{err: err}
				return
			}
		}
	})

	heartbeatTicker, heartbeatC := newStreamHeartbeatTicker()
	if heartbeatTicker != nil {
		defer heartbeatTicker.Stop()
	}

	for {
		select {
		case <-ctx.Done():
			err := contextError(ctx)
			if isLocalRelayBudgetExceeded(ctx, err) {
				return err
			}
			log.Infof("client disconnected, stopping stream: written=%t raw_bytes=%d first_token_seen=%t elapsed=%s", ra.streamPayloadWritten.Load(), rawStream.Len(), true, time.Since(ra.metrics.StartTime))
			if rawStream.Len() > 0 {
				ra.metrics.SetRawDebugResponsePayload(rawStream.Bytes(), response.Header, response.StatusCode)
				ra.collectAnthropicPassthroughMetrics(context.Background(), rawStream.Bytes())
				ra.collectResponse()
			}
			return err
		case <-heartbeatC:
			if err := writeSSEHeartbeat(writer); err != nil {
				return err
			}
		case r, ok := <-results:
			if !ok {
				ra.metrics.SetRawDebugResponsePayload(rawStream.Bytes(), response.Header, response.StatusCode)
				ra.collectAnthropicPassthroughMetrics(ctx, rawStream.Bytes())
				ra.collectResponse()
				log.Infof("stream end")
				return nil
			}
			if r.err != nil {
				if r.err == io.EOF {
					ra.metrics.SetRawDebugResponsePayload(rawStream.Bytes(), response.Header, response.StatusCode)
					ra.collectAnthropicPassthroughMetrics(ctx, rawStream.Bytes())
					ra.collectResponse()
					log.Infof("stream end")
					return nil
				}
				log.Warnf("failed to read event: %v", r.err)
				return fmt.Errorf("failed to read stream event: %w", r.err)
			}

			if len(r.chunk) == 0 {
				continue
			}
			if _, werr := writer.Write(r.chunk); werr != nil {
				return werr
			}
			ra.streamPayloadWritten.Store(true)
			_, _ = rawStream.Write(r.chunk)
			writer.Flush()
		}
	}
}

func (ra *relayAttempt) collectAnthropicPassthroughMetrics(ctx context.Context, rawStream []byte) {
	if len(rawStream) == 0 {
		return
	}
	outEventAdapter, outOk := ra.outAdapter.(model.OutboundStreamEventTransformer)
	inEventAdapter, inOk := ra.inAdapter.(model.InboundStreamEventTransformer)
	if outOk && inOk {
		readCfg := &sse.ReadConfig{MaxEventSize: maxSSEEventSize}
		for ev, err := range sse.Read(bytes.NewReader(rawStream), readCfg) {
			if err != nil {
				log.Debugf("anthropic passthrough metrics parse skipped: %v", err)
				return
			}
			if events, terr := outEventAdapter.TransformStreamEvent(ctx, []byte(ev.Data)); terr == nil && len(events) > 0 {
				_, _ = inEventAdapter.TransformStreamEvents(ctx, events)
			}
		}
		return
	}
	readCfg := &sse.ReadConfig{MaxEventSize: maxSSEEventSize}
	for ev, err := range sse.Read(bytes.NewReader(rawStream), readCfg) {
		if err != nil {
			log.Debugf("anthropic passthrough metrics parse skipped: %v", err)
			return
		}
		if internalStream, terr := ra.outAdapter.TransformStream(ctx, []byte(ev.Data)); terr == nil && internalStream != nil {
			_, _ = ra.inAdapter.TransformStream(ctx, internalStream)
		}
	}
}
