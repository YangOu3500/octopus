package relay

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	dbmodel "github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/relay/balancer"
	"github.com/bestruirui/octopus/internal/server/resp"
	"github.com/bestruirui/octopus/internal/transformer/inbound"
	"github.com/bestruirui/octopus/internal/transformer/model"
	"github.com/bestruirui/octopus/internal/transformer/outbound"
	"github.com/bestruirui/octopus/internal/utils/log"
	"github.com/gin-gonic/gin"
)

func Handler(inboundType inbound.InboundType, c *gin.Context) {
	// 解析请求
	rawBody, internalRequest, inAdapter, err := parseRequest(inboundType, c)
	if err != nil {
		return
	}
	supportedModels := c.GetString("supported_models")
	if supportedModels != "" {
		supportedModelsArray := strings.Split(supportedModels, ",")
		if !slices.Contains(supportedModelsArray, internalRequest.Model) {
			resp.ErrorWithCode(c, http.StatusBadRequest, CodeRelayModelNotSupported, "model not supported")
			return
		}
	}

	requestModel := internalRequest.Model
	apiKeyID := c.GetInt("api_key_id")

	// 获取通道分组
	group, err := op.GroupGetEnabledMap(requestModel, c.Request.Context())
	if err != nil {
		resp.ErrorWithCode(c, http.StatusNotFound, CodeRelayModelNotFound, "model not found")
		return
	}

	// 创建迭代器（策略排序 + 粘性优先）
	iter := balancer.NewIterator(group, apiKeyID, requestModel)
	if iter.Len() == 0 {
		resp.ErrorWithCode(c, http.StatusServiceUnavailable, CodeRelayNoAvailableChannel, "no available channel")
		return
	}

	// === 早期心跳 ===
	// 在所有 forward / 重试 / 退避之前启动早期心跳协程，覆盖前置阶段（连接慢、failover、退避叠加）
	// 期间向客户端发 SSE 注释字节，避免被 Cloudflare 在 120s 零字节阈值上判 524。
	// 仅对流式请求生效；非流式无法发送 SSE 注释（破坏 application/json 协议），
	// 不施加任何本地超时——上游慢响应应让其自然完成或由上游/CF 自身处理。
	isStream := internalRequest.Stream != nil && *internalRequest.Stream
	hb := startEarlyHeartbeat(c, isStream)
	defer hb.Stop()

	// 初始化 Metrics
	metrics := NewRelayMetrics(apiKeyID, requestModel, rawBody, internalRequest)
	enableRawDebugFromHeaders(c.Request.Context(), metrics, c.Request.Header)
	metrics.SetGroupID(group.ID)
	metrics.SetClientInfo(c.ClientIP(), "relay")
	metrics.BeginActiveTracking("routing")
	streamGate := newStreamGateConfig(group.FirstTokenTimeOut)
	responsesPassthroughRequired := internalRequest.HasOpenAIResponsesPassthrough()
	responsesPassthroughCapableFound := false

	// 请求级上下文
	req := &relayRequest{
		c:               c,
		inAdapter:       inAdapter,
		internalRequest: internalRequest,
		metrics:         metrics,
		apiKeyID:        apiKeyID,
		requestModel:    requestModel,
		iter:            iter,
		rawBody:         rawBody,
		heartbeat:       hb,
	}

	var lastErr error
	var lastResult attemptResult

	// 同通道重试次数：启用时使用配置值，否则 1 次（不重试）
	maxSameChannelRetries := 1
	if group.RetryEnabled {
		maxSameChannelRetries = group.MaxRetries
		if maxSameChannelRetries <= 0 {
			maxSameChannelRetries = 3
		}
	}

	for iter.Next() {
		select {
		case <-c.Request.Context().Done():
			log.Infof("request context canceled, stopping retry")
			metrics.Save(c.Request.Context(), false, context.Canceled, iter.Attempts())
			return
		default:
		}

		item := iter.Item()

		// 获取通道
		channel, err := op.ChannelGet(item.ChannelID, c.Request.Context())
		if err != nil {
			log.Warnf("failed to get channel %d: %v", item.ChannelID, err)
			iter.Skip(item.ChannelID, 0, fmt.Sprintf("channel_%d", item.ChannelID), fmt.Sprintf("channel not found: %v", err))
			lastErr = err
			continue
		}
		if !channel.Enabled {
			iter.Skip(channel.ID, 0, channel.Name, "channel disabled")
			continue
		}
		if responsesPassthroughRequired {
			if channel.Type == outbound.OutboundTypeOpenAIResponse {
				responsesPassthroughCapableFound = true
			} else {
				iter.Skip(channel.ID, 0, channel.Name, "openai responses passthrough required")
				continue
			}
		}

		// 出站适配器
		outAdapter := outbound.Get(channel.Type)
		if outAdapter == nil {
			iter.Skip(channel.ID, 0, channel.Name, fmt.Sprintf("unsupported channel type: %d", channel.Type))
			continue
		}

		// 类型兼容性检查
		if internalRequest.IsEmbeddingRequest() && !outbound.IsEmbeddingChannelType(channel.Type) {
			iter.Skip(channel.ID, 0, channel.Name, "channel type not compatible with embedding request")
			continue
		}
		if internalRequest.IsChatRequest() && !outbound.IsChatChannelType(channel.Type) {
			iter.Skip(channel.ID, 0, channel.Name, "channel type not compatible with chat request")
			continue
		}

		runtimeState, ok := evaluateRuntimeCandidateForRelay(c.Request.Context(), iter, channel, item.ModelName)
		if !ok {
			continue
		}

		// 设置实际模型
		internalRequest.Model = item.ModelName

		log.Infof("request model %s, mode: %d, forwarding to channel: %s model: %s (attempt %d/%d, sticky=%t)",
			requestModel, group.Mode, channel.Name, item.ModelName,
			iter.Index()+1, iter.Len(), iter.IsSticky())

		usedKey, blockedMeta, excludedCount := selectRelayChannelKey(channel, iter, runtimeState, iter.StickyKeyID())
		if usedKey.ChannelKey == "" {
			if excludedCount == 0 || dbmodel.HasAttemptCapacityMeta(blockedMeta) {
				iter.SkipWithMeta(channel.ID, 0, channel.Name, "no available key", relayNoAvailableKeyMeta(blockedMeta))
			}
			continue
		}

		// 同通道重试循环
		var result attemptResult
		for retryNum := 0; retryNum < maxSameChannelRetries; retryNum++ {
			// 重试前等待退避
			if retryNum > 0 {
				delay := computeBackoff(retryNum, result.RetryAfter)
				log.Infof("same-channel retry %d/%d for %s, waiting %v",
					retryNum, maxSameChannelRetries, channel.Name, delay)
				select {
				case <-c.Request.Context().Done():
					log.Infof("request context canceled during retry backoff")
					metrics.Save(c.Request.Context(), false, context.Canceled, iter.Attempts())
					return
				case <-time.After(delay):
				}

				// 重建 outAdapter 以重置流式状态（toolIndex, toolCalls 等）
				outAdapter = outbound.Get(channel.Type)
			}

			// 构造尝试级上下文
			ra := &relayAttempt{
				relayRequest:         req,
				outAdapter:           outAdapter,
				channel:              channel,
				usedKey:              usedKey,
				siteID:               runtimeState.SiteID,
				siteAccountID:        runtimeState.SiteAccountID,
				attemptMeta:          runtimeState.AttemptMeta,
				firstTokenTimeOutSec: streamGate.firstValidTimeoutSec,
				streamGate:           streamGate,
			}

			result = ra.attempt()
			if result.Success || result.Written || result.Canceled || result.SkipCandidate || result.ResetConversation || !isRetryableStatus(result.StatusCode) {
				break
			}
		}

		// 同通道重试耗尽后记录熔断器失败
		if !result.Success && !result.Written && !result.Canceled && !result.SkipCandidate && !result.ResetConversation {
			failureKind := circuitFailureKind(group.RetryEnabled, result.StatusCode)
			balancer.RecordFailure(channel.ID, usedKey.ID, internalRequest.Model, failureKind)
			if failureKind == balancer.FailureHard {
				maybeLearnManagedRoute(c.Request.Context(), channel.ID, internalRequest.Model, inboundType, result.Err)
			}
		}

		if result.Success {
			metrics.Save(c.Request.Context(), true, nil, iter.Attempts())
			return
		}
		if result.Canceled {
			metrics.Save(c.Request.Context(), false, result.Err, iter.Attempts())
			return
		}
		if result.ResetConversation {
			metrics.Save(c.Request.Context(), false, result.Err, iter.Attempts())
			if publicErr, ok := classifyWSPublicError(result.Err, result.StatusCode); ok {
				hb.FlushOrError(c, publicErr.Status, publicErr.Message)
			} else {
				hb.FlushOrError(c, result.StatusCode, result.Err.Error())
			}
			return
		}
		if result.Written {
			metrics.Save(c.Request.Context(), false, result.Err, iter.Attempts())
			return
		}
		lastErr = result.Err
		lastResult = result
	}

	// 所有候选通道均失败
	if responsesPassthroughRequired && !responsesPassthroughCapableFound {
		err := fmt.Errorf("openai responses native tools require an openai responses channel")
		metrics.Save(c.Request.Context(), false, err, iter.Attempts())
		hb.FlushOrError(c, http.StatusBadRequest, "当前请求包含 OpenAI Responses 原生工具，仅支持 OpenAI Responses 通道直通")
		return
	}
	metrics.Save(c.Request.Context(), false, lastErr, iter.Attempts())

	// 透传 429/503 状态码和 Retry-After 头，让客户端 SDK 的重试机制接管
	if isPassthroughStatus(lastResult.StatusCode) {
		if lastResult.RetryAfter > 0 {
			c.Header("Retry-After", fmt.Sprintf("%d", int(lastResult.RetryAfter.Seconds())))
		}
		hb.FlushOrError(c, lastResult.StatusCode, "channel failed")
		return
	}
	if lastResult.StatusCode > 0 {
		hb.FlushOrError(c, finalRelayFailureStatus(lastResult.StatusCode), "channel failed")
		return
	}
	hb.FlushOrError(c, http.StatusBadGateway, "channel failed")
}

func circuitFailureKind(retryEnabled bool, statusCode int) balancer.FailureKind {
	if retryEnabled && isPassthroughStatus(statusCode) {
		return balancer.FailureSoftRateLimit
	}
	return balancer.FailureHard
}

func (ra *relayAttempt) attempt() attemptResult {
	span := ra.iter.StartAttempt(ra.channel.ID, ra.usedKey.ID, ra.channel.Name)
	span.SetCapacityMeta(ra.attemptMeta)
	ra.metrics.markActiveAttemptStart(activeAttemptInfo{
		ChannelID:     ra.channel.ID,
		ChannelName:   ra.channel.Name,
		ChannelKeyID:  ra.usedKey.ID,
		ModelName:     ra.internalRequest.Model,
		SiteID:        ra.siteID,
		SiteAccountID: ra.siteAccountID,
		AttemptMeta:   ra.attemptMeta,
		AttemptCount:  len(ra.iter.Attempts()) + 1,
	})

	queueCfg := balancer.CurrentChannelConcurrencyConfig()
	if queueCfg.Enabled && queueCfg.MaxInFlight > 0 {
		ra.metrics.markActiveAttemptQueueing(queueCfg.Mode, queueCfg.MaxInFlight)
	}
	releaseConcurrency, waited, acquired := balancer.AcquireChannelConcurrency(ra.requestContext(), ra.channel.ID, ra.internalRequest.Model)
	if queueCfg.Enabled && queueCfg.MaxInFlight > 0 {
		span.SetChannelConcurrency(queueCfg.Mode, queueCfg.MaxInFlight, waited, acquired, !acquired)
		ra.metrics.markActiveAttemptQueueResult(queueCfg.Mode, queueCfg.MaxInFlight, waited, acquired, !acquired)
	}
	if !acquired {
		err := balancer.ErrChannelConcurrencyQueueTimeout
		span.End(dbmodel.AttemptFailed, 0, err.Error())
		ra.metrics.markActiveAttemptEnd(dbmodel.AttemptFailed, 0, err.Error(), false, len(ra.iter.Attempts()))
		return attemptResult{
			Success:       false,
			SkipCandidate: true,
			Err:           err,
			StatusCode:    0,
		}
	}
	defer releaseConcurrency()

	// 转发请求
	statusCode, fwdErr := ra.forward()

	// 更新 channel key 状态
	ra.usedKey.StatusCode = statusCode
	ra.usedKey.LastUseTimeStamp = time.Now().Unix()

	if fwdErr == nil {
		// ====== 成功 ======
		// Only collect response if NOT using passthrough (passthrough collects at stream end)
		if !ra.shouldPassthroughAnthropic() {
			ra.collectResponse()
		}
		ra.usedKey.TotalCost += ra.metrics.Stats.InputCost + ra.metrics.Stats.OutputCost
		op.ChannelKeyUpdate(ra.usedKey)

		span.End(dbmodel.AttemptSuccess, statusCode, "")
		balancer.RecordHealthAttempt(balancer.HealthAttempt{
			ChannelID:     ra.channel.ID,
			ChannelKeyID:  ra.usedKey.ID,
			SiteID:        ra.siteID,
			SiteAccountID: ra.siteAccountID,
			ModelName:     ra.internalRequest.Model,
			BaseURL:       ra.channel.GetBaseUrl(),
			Status:        dbmodel.AttemptSuccess,
			HTTPStatus:    statusCode,
			TTFBMS:        span.FirstTokenDurationMS(ra.metrics.FirstTokenTime),
			TotalMS:       int(span.Duration().Milliseconds()),
		})

		// Channel 维度统计
		op.StatsChannelUpdate(ra.channel.ID, dbmodel.StatsMetrics{
			WaitTime:       span.Duration().Milliseconds(),
			RequestSuccess: 1,
		})

		// 熔断器：记录成功
		balancer.RecordSuccess(ra.channel.ID, ra.usedKey.ID, ra.internalRequest.Model)
		// 会话保持：更新粘性记录
		balancer.SetSticky(ra.apiKeyID, ra.requestModel, ra.channel.ID, ra.usedKey.ID)

		ra.metrics.markActiveAttemptEnd(dbmodel.AttemptSuccess, statusCode, "", ra.streamPayloadWritten.Load(), len(ra.iter.Attempts()))
		return attemptResult{Success: true}
	}

	// ====== 失败 ======
	if isClientCancellation(ra.requestContext(), fwdErr) {
		written := ra.streamPayloadWritten.Load()
		if written {
			ra.collectResponse()
		}
		op.ChannelKeyUpdate(ra.usedKey)
		span.End(dbmodel.AttemptFailed, statusCode, fwdErr.Error())
		balancer.RecordHealthAttempt(balancer.HealthAttempt{
			ChannelID:     ra.channel.ID,
			ChannelKeyID:  ra.usedKey.ID,
			SiteID:        ra.siteID,
			SiteAccountID: ra.siteAccountID,
			ModelName:     ra.internalRequest.Model,
			BaseURL:       ra.channel.GetBaseUrl(),
			Status:        dbmodel.AttemptFailed,
			HTTPStatus:    statusCode,
			FailureReason: fwdErr.Error(),
			RetryAfter:    ra.retryAfter,
			TotalMS:       int(span.Duration().Milliseconds()),
		})
		ra.metrics.markActiveAttemptEnd(dbmodel.AttemptFailed, statusCode, fwdErr.Error(), written, len(ra.iter.Attempts()))
		return attemptResult{
			Success:    false,
			Written:    written,
			Canceled:   true,
			Err:        fwdErr,
			StatusCode: statusCode,
		}
	}

	op.ChannelKeyUpdate(ra.usedKey)
	span.End(dbmodel.AttemptFailed, statusCode, fwdErr.Error())
	balancer.RecordHealthAttempt(balancer.HealthAttempt{
		ChannelID:     ra.channel.ID,
		ChannelKeyID:  ra.usedKey.ID,
		SiteID:        ra.siteID,
		SiteAccountID: ra.siteAccountID,
		ModelName:     ra.internalRequest.Model,
		BaseURL:       ra.channel.GetBaseUrl(),
		Status:        dbmodel.AttemptFailed,
		HTTPStatus:    statusCode,
		FailureReason: fwdErr.Error(),
		RetryAfter:    ra.retryAfter,
		TotalMS:       int(span.Duration().Milliseconds()),
	})

	// Channel 维度统计
	op.StatsChannelUpdate(ra.channel.ID, dbmodel.StatsMetrics{
		WaitTime:      span.Duration().Milliseconds(),
		RequestFailed: 1,
	})

	// 注意：熔断器记录已移至 Handler() 的同通道重试循环外，
	// 避免重试期间过早触发熔断

	written := ra.streamPayloadWritten.Load()
	if written {
		ra.collectResponse()
	}
	ra.metrics.markActiveAttemptEnd(dbmodel.AttemptFailed, statusCode, fwdErr.Error(), written, len(ra.iter.Attempts()))
	return attemptResult{
		Success:           false,
		Written:           written,
		ResetConversation: statusCode == http.StatusConflict && needsConversationRestart(relayErrorMessage(fwdErr)),
		Err:               fmt.Errorf("channel %s failed: %v", ra.channel.Name, fwdErr),
		StatusCode:        statusCode,
		RetryAfter:        ra.retryAfter,
	}
}

// parseRequest 解析并验证入站请求

func (ra *relayAttempt) forward() (int, error) {
	ctx := ra.requestContext()

	// 尝试上游 WebSocket（仅 OpenAI Response outbound 类型）
	if ra.channel.Type == outbound.OutboundTypeOpenAIResponse &&
		ra.internalRequest.RawAPIFormat == model.APIFormatOpenAIResponse {

		shouldTryWS := false
		if ra.shouldPassthroughOpenAIResponses() {
			shouldTryWS = false
		} else if ra.internalRequest.IsOpenAIExactReplayRequest() {
			shouldTryWS = false
		} else {
			wsUpgradeEnabled, _ := op.SettingGetBool(dbmodel.SettingKeyRelayWSUpgradeEnabled)
			if wsUpgradeEnabled {
				// 设置启用：无论客户端协议都主动尝试 WS 上游
				shouldTryWS = true
			} else {
				// 设置禁用：仅当客户端也是 WS 时才尝试 WS 上游
				shouldTryWS = (ra.c == nil)
			}
		}

		if shouldTryWS {
			statusCode, err := ra.forwardViaWS(ctx)
			if statusCode != -1 {
				return statusCode, err
			}
			if requiresUpstreamWSContinuation(ra.internalRequest) {
				balancer.DeleteSticky(ra.apiKeyID, ra.requestModel)
				return http.StatusConflict, fmt.Errorf("upstream continuation transport unavailable; please restart the conversation")
			}
			ra.metrics.SetWSRecovery(dbmodel.RelayLogWSRecoveryDowngrade)
			// statusCode == -1 means WS not available, fall through to HTTP
		}
	}

	return ra.forwardViaHTTP(ctx)
}

// forwardViaWS attempts to forward via upstream WebSocket.
