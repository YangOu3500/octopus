package relay

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/bestruirui/octopus/internal/helper"
	"github.com/bestruirui/octopus/internal/server/resp"
	"github.com/bestruirui/octopus/internal/transformer/inbound"
	"github.com/bestruirui/octopus/internal/transformer/model"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
	outAnthropic "github.com/bestruirui/octopus/internal/transformer/outbound/anthropic"
	openaiOutbound "github.com/bestruirui/octopus/internal/transformer/outbound/openai"
	"github.com/bestruirui/octopus/internal/utils/log"
	"github.com/gin-gonic/gin"
)

func parseRequest(inboundType inbound.InboundType, c *gin.Context) ([]byte, *model.InternalLLMRequest, model.Inbound, error) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return nil, nil, nil, err
	}

	inAdapter := inbound.Get(inboundType)
	internalRequest, err := inAdapter.TransformRequest(c.Request.Context(), body)
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return nil, nil, nil, err
	}

	// Pass through the original query parameters
	internalRequest.Query = c.Request.URL.Query()

	if err := internalRequest.Validate(); err != nil {
		resp.Error(c, http.StatusBadRequest, err.Error())
		return nil, nil, nil, err
	}

	return body, internalRequest, inAdapter, nil
}

func (ra *relayAttempt) forwardViaHTTP(ctx context.Context) (int, error) {
	// Anthropic→Anthropic 同格式直通：绕过 Internal model 往返转换，避免字段丢失、
	// 内容块重排、thinking 签名错位等在长上下文下触发上游 520 的问题。
	if ra.shouldPassthroughAnthropic() {
		return ra.forwardViaHTTPPassthroughAnthropic(ctx)
	}
	if ra.shouldPassthroughOpenAIResponses() {
		return ra.forwardViaHTTPPassthroughOpenAIResponses(ctx)
	}

	// 构建出站请求
	outboundRequest, err := ra.outAdapter.TransformRequest(
		ctx,
		ra.internalRequest,
		ra.channel.GetBaseUrl(),
		ra.usedKey.ChannelKey,
	)
	if err != nil {
		log.Warnf("failed to create request: %v", err)
		return 0, fmt.Errorf("failed to create request: %w", err)
	}
	if requestBody, readErr := readOutboundRequestBody(outboundRequest); readErr == nil {
		ra.metrics.SetTransportRequestPayload(requestBody, ra.internalRequest.Model)
	}

	// 复制请求头
	ra.copyHeaders(outboundRequest)
	if ra.channel.Type == outbound.OutboundTypeOpenAIResponse {
		outboundRequest.Header.Set("Content-Type", "application/json")
	}

	// 发送请求
	response, err := ra.sendRequest(outboundRequest)
	if err != nil {
		return 0, fmt.Errorf("failed to send request: %w", err)
	}
	defer response.Body.Close()

	// 检查响应状态
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		ra.retryAfter = parseRetryAfter(response.Header.Get("Retry-After"))
		body, err := io.ReadAll(response.Body)
		if err != nil {
			return response.StatusCode, fmt.Errorf("failed to read response body: %w", err)
		}
		ra.metrics.SetRawDebugResponsePayload(body, response.Header, response.StatusCode)
		statusCode := normalizeUpstreamStatusCode(response.StatusCode, string(body))
		log.Warnf("upstream error from channel %s: status=%d, body=%s", ra.channel.Name, response.StatusCode, string(body))
		return statusCode, fmt.Errorf("upstream error: %d: %s", response.StatusCode, string(body))
	}

	// 处理响应
	if ra.internalRequest.Stream != nil && *ra.internalRequest.Stream {
		if err := ra.handleStreamResponse(ctx, response); err != nil {
			return response.StatusCode, err
		}
		return response.StatusCode, nil
	}
	if err := ra.handleResponse(ctx, response); err != nil {
		return response.StatusCode, err
	}
	return response.StatusCode, nil
}

func readOutboundRequestBody(req *http.Request) ([]byte, error) {
	if req == nil || req.Body == nil {
		return nil, nil
	}
	if req.GetBody != nil {
		bodyReader, err := req.GetBody()
		if err != nil {
			return nil, err
		}
		defer bodyReader.Close()
		return io.ReadAll(bodyReader)
	}
	body, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, err
	}
	req.Body = io.NopCloser(bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	return body, nil
}

func (ra *relayAttempt) copyHeaders(outboundRequest *http.Request) {
	if ra.c != nil {
		for key, values := range ra.c.Request.Header {
			lowerKey := strings.ToLower(key)
			if hopByHopHeaders[lowerKey] {
				continue
			}
			// anthropic-beta 需要与出站默认值合并去重，避免覆盖掉
			// 透传路径预置的 prompt-caching / extended-cache-ttl 基线。
			if lowerKey == "anthropic-beta" {
				existing := outboundRequest.Header.Get(key)
				for _, value := range values {
					existing = mergeBetaHeader(existing, value)
				}
				if existing != "" {
					outboundRequest.Header.Set(key, existing)
				}
				continue
			}
			for _, value := range values {
				outboundRequest.Header.Set(key, value)
			}
		}
	}
	if len(ra.channel.CustomHeader) > 0 {
		for _, header := range ra.channel.CustomHeader {
			outboundRequest.Header.Set(header.HeaderKey, header.HeaderValue)
		}
	}
}

// mergeBetaHeader 合并两个逗号分隔的 anthropic-beta 字段值，去重并保留先后顺序。
func mergeBetaHeader(existing, incoming string) string {
	seen := make(map[string]struct{}, 8)
	merged := make([]string, 0, 8)
	for _, source := range []string{existing, incoming} {
		for _, entry := range strings.Split(source, ",") {
			normalized := strings.TrimSpace(entry)
			if normalized == "" {
				continue
			}
			if _, ok := seen[normalized]; ok {
				continue
			}
			seen[normalized] = struct{}{}
			merged = append(merged, normalized)
		}
	}
	return strings.Join(merged, ",")
}

// sendRequest 发送 HTTP 请求
func (ra *relayAttempt) sendRequest(req *http.Request) (*http.Response, error) {
	httpClient, err := helper.ChannelHttpClient(ra.channel)
	if err != nil {
		log.Warnf("failed to get http client: %v", err)
		return nil, err
	}

	response, err := httpClient.Do(req)
	if err != nil {
		if isClientCancellation(req.Context(), err) {
			log.Infof("request canceled before upstream response: %v", err)
		} else {
			log.Warnf("failed to send request: %v", err)
		}
		return nil, err
	}

	return response, nil
}

func (ra *relayAttempt) handleResponse(ctx context.Context, response *http.Response) error {
	body, err := readResponseBody(response)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}
	ra.metrics.SetRawDebugResponsePayload(body, response.Header, response.StatusCode)
	if err := validateNonStreamBody(ra.channel.Type, response, body); err != nil {
		log.Warnf("response validator rejected non-stream response from channel %s: %v", ra.channel.Name, err)
		return err
	}
	restoreResponseBody(response, body)

	internalResponse, err := ra.outAdapter.TransformResponse(ctx, response)
	if err != nil {
		log.Warnf("failed to transform response: %v", err)
		return fmt.Errorf("failed to transform outbound response: %w", err)
	}

	inResponse, err := ra.inAdapter.TransformResponse(ctx, internalResponse)
	if err != nil {
		log.Warnf("failed to transform response: %v", err)
		return fmt.Errorf("failed to transform inbound response: %w", err)
	}

	ra.c.Data(http.StatusOK, "application/json", inResponse)
	return nil
}

func (ra *relayAttempt) shouldPassthroughAnthropic() bool {
	if ra == nil || ra.internalRequest == nil || ra.channel == nil {
		return false
	}
	if len(ra.rawBody) == 0 {
		return false
	}
	if ra.internalRequest.RawAPIFormat != model.APIFormatAnthropicMessage {
		return false
	}
	return ra.channel.Type == outbound.OutboundTypeAnthropic
}

// shouldPassthroughOpenAIResponses 判定是否走 OpenAI Responses→OpenAI Responses 原生直通路径。
// 同协议 HTTP/SSE 请求默认直通，避免 Responses 原生事件、未知字段或输出项在内部模型往返时被重组。
func (ra *relayAttempt) shouldPassthroughOpenAIResponses() bool {
	if ra == nil || ra.internalRequest == nil || ra.channel == nil {
		return false
	}
	if ra.c == nil {
		return false
	}
	if len(ra.rawBody) == 0 {
		return false
	}
	if ra.internalRequest.RawAPIFormat != model.APIFormatOpenAIResponse {
		return false
	}
	if ra.internalRequest.IsOpenAIExactReplayRequest() || requiresUpstreamWSContinuation(ra.internalRequest) {
		return false
	}
	return ra.channel.Type == outbound.OutboundTypeOpenAIResponse
}

// forwardViaHTTPPassthroughOpenAIResponses 直通 OpenAI Responses 原始 JSON/SSE。
// 客户端原始 body 只改顶层 model 后发上游，响应原样写回客户端；旁路解析仅用于 metrics。
func (ra *relayAttempt) forwardViaHTTPPassthroughOpenAIResponses(ctx context.Context) (int, error) {
	openaiOut, ok := ra.outAdapter.(*openaiOutbound.ResponseOutbound)
	if !ok {
		return ra.forwardViaHTTPStandard(ctx)
	}

	outboundRequest, err := openaiOut.TransformRequestRaw(
		ctx,
		ra.rawBody,
		ra.internalRequest.Model,
		ra.channel.GetBaseUrl(),
		ra.usedKey.ChannelKey,
		ra.internalRequest.Query,
	)
	if err != nil {
		log.Warnf("failed to create passthrough request: %v", err)
		return 0, fmt.Errorf("failed to create request: %w", err)
	}

	if requestBody, readErr := readOutboundRequestBody(outboundRequest); readErr == nil {
		ra.metrics.SetTransportRequestPayload(requestBody, ra.internalRequest.Model)
	}
	ra.copyHeaders(outboundRequest)
	outboundRequest.Header.Set("Content-Type", "application/json")

	response, err := ra.sendRequest(outboundRequest)
	if err != nil {
		return 0, fmt.Errorf("failed to send request: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		ra.retryAfter = parseRetryAfter(response.Header.Get("Retry-After"))
		body, readErr := io.ReadAll(response.Body)
		if readErr != nil {
			return response.StatusCode, fmt.Errorf("failed to read response body: %w", readErr)
		}
		ra.metrics.SetRawDebugResponsePayload(body, response.Header, response.StatusCode)
		statusCode := normalizeUpstreamStatusCode(response.StatusCode, string(body))
		log.Warnf("upstream error from channel %s: status=%d, body=%s", ra.channel.Name, response.StatusCode, string(body))
		return statusCode, fmt.Errorf("upstream error: %d: %s", response.StatusCode, string(body))
	}

	if ra.internalRequest.Stream != nil && *ra.internalRequest.Stream {
		if err := ra.handleStreamResponsePassthroughOpenAIResponses(ctx, response); err != nil {
			return response.StatusCode, err
		}
		return response.StatusCode, nil
	}
	if err := ra.handleResponsePassthroughOpenAIResponses(ctx, response); err != nil {
		return response.StatusCode, err
	}
	return response.StatusCode, nil
}

func (ra *relayAttempt) handleResponsePassthroughOpenAIResponses(ctx context.Context, response *http.Response) error {
	body, err := readResponseBody(response)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}
	ra.metrics.SetRawDebugResponsePayload(body, response.Header, response.StatusCode)
	if err := validateNonStreamBody(ra.channel.Type, response, body); err != nil {
		log.Warnf("response validator rejected openai responses body from channel %s: %v", ra.channel.Name, err)
		return err
	}

	contentType := response.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	ra.c.Data(response.StatusCode, contentType, body)

	sidecarResp := &http.Response{
		StatusCode: response.StatusCode,
		Header:     response.Header.Clone(),
		Body:       io.NopCloser(bytes.NewReader(body)),
	}
	if internalResponse, terr := ra.outAdapter.TransformResponse(ctx, sidecarResp); terr == nil && internalResponse != nil {
		_, _ = ra.inAdapter.TransformResponse(ctx, internalResponse)
	}
	return nil
}

// forwardViaHTTPPassthroughAnthropic 直通路径：客户端原始 body 原样转发；上游响应原样写回客户端；
// 旁路解析 SSE/JSON 仅用于 metrics（token 统计、计费），不参与写回客户端的字节流。
func (ra *relayAttempt) forwardViaHTTPPassthroughAnthropic(ctx context.Context) (int, error) {
	anthropicOut, ok := ra.outAdapter.(*outAnthropic.MessageOutbound)
	if !ok {
		// 通道注册异常，回退到标准路径
		return ra.forwardViaHTTPStandard(ctx)
	}

	outboundRequest, err := anthropicOut.TransformRequestRaw(
		ctx,
		ra.rawBody,
		ra.internalRequest.Model,
		ra.channel.GetBaseUrl(),
		ra.usedKey.ChannelKey,
		ra.internalRequest.Query,
	)
	if err != nil {
		log.Warnf("failed to create passthrough request: %v", err)
		return 0, fmt.Errorf("failed to create request: %w", err)
	}

	// 记录实际上行 payload；直通路径会在这里把顶层 model 改写成命中的上游模型。
	if requestBody, readErr := readOutboundRequestBody(outboundRequest); readErr == nil {
		ra.metrics.SetTransportRequestPayload(requestBody, ra.internalRequest.Model)
	}

	// 复制客户端请求头（hop-by-hop 过滤保证 x-api-key/authorization/host/content-length
	// /accept-encoding 不会覆盖出站设置的关键头；anthropic-beta / anthropic-version /
	// user-agent / x-stainless-* 等原样透传）
	ra.copyHeaders(outboundRequest)

	// 发送请求
	response, err := ra.sendRequest(outboundRequest)
	if err != nil {
		return 0, fmt.Errorf("failed to send request: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		ra.retryAfter = parseRetryAfter(response.Header.Get("Retry-After"))
		body, readErr := io.ReadAll(response.Body)
		if readErr != nil {
			return response.StatusCode, fmt.Errorf("failed to read response body: %w", readErr)
		}
		ra.metrics.SetRawDebugResponsePayload(body, response.Header, response.StatusCode)
		statusCode := normalizeUpstreamStatusCode(response.StatusCode, string(body))
		log.Warnf("upstream error from channel %s: status=%d, body=%s", ra.channel.Name, response.StatusCode, string(body))
		return statusCode, fmt.Errorf("upstream error: %d: %s", response.StatusCode, string(body))
	}

	if ra.internalRequest.Stream != nil && *ra.internalRequest.Stream {
		if err := ra.handleStreamResponsePassthroughAnthropic(ctx, response); err != nil {
			return response.StatusCode, err
		}
		return response.StatusCode, nil
	}
	if err := ra.handleResponsePassthroughAnthropic(ctx, response); err != nil {
		return response.StatusCode, err
	}
	return response.StatusCode, nil
}

// forwardViaHTTPStandard 是 forwardViaHTTP 的原路径（直通判定失败时的兜底）。
// 留作显式出口，避免 passthrough 失败时的递归。
func (ra *relayAttempt) forwardViaHTTPStandard(ctx context.Context) (int, error) {
	outboundRequest, err := ra.outAdapter.TransformRequest(
		ctx,
		ra.internalRequest,
		ra.channel.GetBaseUrl(),
		ra.usedKey.ChannelKey,
	)
	if err != nil {
		log.Warnf("failed to create request: %v", err)
		return 0, fmt.Errorf("failed to create request: %w", err)
	}
	if requestBody, readErr := readOutboundRequestBody(outboundRequest); readErr == nil {
		ra.metrics.SetTransportRequestPayload(requestBody, ra.internalRequest.Model)
	}
	ra.copyHeaders(outboundRequest)

	response, err := ra.sendRequest(outboundRequest)
	if err != nil {
		return 0, fmt.Errorf("failed to send request: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		ra.retryAfter = parseRetryAfter(response.Header.Get("Retry-After"))
		body, readErr := io.ReadAll(response.Body)
		if readErr != nil {
			return response.StatusCode, fmt.Errorf("failed to read response body: %w", readErr)
		}
		statusCode := normalizeUpstreamStatusCode(response.StatusCode, string(body))
		log.Warnf("upstream error from channel %s: status=%d, body=%s", ra.channel.Name, response.StatusCode, string(body))
		return statusCode, fmt.Errorf("upstream error: %d: %s", response.StatusCode, string(body))
	}

	if ra.internalRequest.Stream != nil && *ra.internalRequest.Stream {
		if err := ra.handleStreamResponse(ctx, response); err != nil {
			return response.StatusCode, err
		}
		return response.StatusCode, nil
	}
	if err := ra.handleResponse(ctx, response); err != nil {
		return response.StatusCode, err
	}
	return response.StatusCode, nil
}

// handleStreamResponsePassthroughAnthropic 将上游 SSE 事件**原样**转发给客户端（不经过

func (ra *relayAttempt) handleResponsePassthroughAnthropic(ctx context.Context, response *http.Response) error {
	body, err := readResponseBody(response)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}
	ra.metrics.SetRawDebugResponsePayload(body, response.Header, response.StatusCode)
	if err := validateNonStreamBody(ra.channel.Type, response, body); err != nil {
		log.Warnf("response validator rejected anthropic body from channel %s: %v", ra.channel.Name, err)
		return err
	}

	contentType := response.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	ra.c.Data(http.StatusOK, contentType, body)

	// 旁路解析：复用 outbound.TransformResponse → inbound.TransformResponse 的 storedResponse
	// 写入，以便 collectResponse 收集 usage 与成本。
	sidecarResp := &http.Response{
		StatusCode: response.StatusCode,
		Header:     response.Header.Clone(),
		Body:       io.NopCloser(bytes.NewReader(body)),
	}
	if internalResponse, terr := ra.outAdapter.TransformResponse(ctx, sidecarResp); terr == nil && internalResponse != nil {
		_, _ = ra.inAdapter.TransformResponse(ctx, internalResponse)
		ra.collectResponse()
	}
	return nil
}
