package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/relay"
	"github.com/bestruirui/octopus/internal/server/middleware"
	"github.com/bestruirui/octopus/internal/server/resp"
	"github.com/bestruirui/octopus/internal/server/router"
	"github.com/gin-gonic/gin"
)

func init() {
	router.NewGroupRouter("/api/v1/log").
		Use(middleware.Auth()).
		AddRoute(
			router.NewRoute("/list", http.MethodGet).
				Handle(listLog),
		).
		AddRoute(
			router.NewRoute("/clear", http.MethodDelete).
				Handle(clearLog),
		).
		AddRoute(
			router.NewRoute("/stream-token", http.MethodGet).
				Handle(getStreamToken),
		).
		AddRoute(
			router.NewRoute("/traces", http.MethodGet).
				Handle(listRequestTraces),
		).
		AddRoute(
			router.NewRoute("/traces/:trace_id", http.MethodGet).
				Handle(getRequestTraceDetail),
		).
		AddRoute(
			router.NewRoute("/detail/:id", http.MethodGet).
				Handle(getLogDetail),
		).
		AddRoute(
			router.NewRoute("/active", http.MethodGet).
				Handle(getActiveRequests),
		)

	router.NewGroupRouter("/api/v1/log").
		AddRoute(
			router.NewRoute("/stream", http.MethodGet).
				Handle(streamLog),
		)
}

func getActiveRequests(c *gin.Context) {
	resp.Success(c, relay.ActiveRequestSnapshots())
}

func listLog(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var startTime, endTime *int
	if startTimeStr != "" && endTimeStr != "" {
		st, err := strconv.Atoi(startTimeStr)
		if err != nil {
			resp.Error(c, http.StatusBadRequest, err.Error())
			return
		}
		et, err := strconv.Atoi(endTimeStr)
		if err != nil {
			resp.Error(c, http.StatusBadRequest, err.Error())
			return
		}
		startTime = &st
		endTime = &et
	}

	query := model.RelayLogListQuery{
		Page:          page,
		PageSize:      pageSize,
		StartTime:     startTime,
		EndTime:       endTime,
		TimeRange:     c.Query("time_range"),
		ChannelIDs:    parseLogIntList(c.Query("channel_ids")),
		Model:         c.Query("model"),
		TraceID:       c.Query("trace_id"),
		APIKey:        c.Query("api_key"),
		Status:        c.Query("status"),
		HTTPStatus:    c.Query("http_status"),
		FailureReason: c.Query("failure_reason"),
		Protocol:      c.Query("protocol"),
		Source:        c.Query("source"),
		SortBy:        c.Query("sort_by"),
		SortOrder:     c.Query("sort_order"),
	}
	if apiKeyID := parseOptionalLogInt(c.Query("api_key_id")); apiKeyID != nil {
		query.APIKeyID = apiKeyID
	}
	if stream := parseOptionalLogBool(c.Query("stream")); stream != nil {
		query.Stream = stream
	}
	if failover := parseOptionalLogBool(c.Query("failover")); failover != nil {
		query.Failover = failover
	}
	if cacheHit := parseOptionalLogBool(c.Query("cache_hit")); cacheHit != nil {
		query.CacheHit = cacheHit
	}

	logs, err := op.RelayLogListWithQuery(c.Request.Context(), query)
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	resp.Success(c, logs)
}

func listRequestTraces(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")

	var startTime, endTime *int
	if startTimeStr != "" && endTimeStr != "" {
		st, err := strconv.Atoi(startTimeStr)
		if err != nil {
			resp.Error(c, http.StatusBadRequest, err.Error())
			return
		}
		et, err := strconv.Atoi(endTimeStr)
		if err != nil {
			resp.Error(c, http.StatusBadRequest, err.Error())
			return
		}
		startTime = &st
		endTime = &et
	}

	query := model.RequestTraceListQuery{
		Page:          page,
		PageSize:      pageSize,
		StartTime:     startTime,
		EndTime:       endTime,
		TimeRange:     c.Query("time_range"),
		ChannelIDs:    parseLogIntList(c.Query("channel_ids")),
		Model:         c.Query("model"),
		TraceID:       c.Query("trace_id"),
		Status:        c.Query("status"),
		HTTPStatus:    c.Query("http_status"),
		FailureReason: c.Query("failure_reason"),
		Protocol:      c.Query("protocol"),
		Source:        c.Query("source"),
		SortBy:        c.Query("sort_by"),
		SortOrder:     c.Query("sort_order"),
	}
	if apiKeyID := parseOptionalLogInt(c.Query("api_key_id")); apiKeyID != nil {
		query.APIKeyID = apiKeyID
	}
	if stream := parseOptionalLogBool(c.Query("stream")); stream != nil {
		query.Stream = stream
	}
	if failover := parseOptionalLogBool(c.Query("failover")); failover != nil {
		query.Failover = failover
	}

	traces, err := op.RequestTraceList(c.Request.Context(), query)
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, traces)
}

func getRequestTraceDetail(c *gin.Context) {
	traceID := strings.TrimSpace(c.Param("trace_id"))
	if traceID == "" {
		resp.Error(c, http.StatusBadRequest, "invalid trace id")
		return
	}

	detail, err := op.RequestTraceDetailByTraceID(c.Request.Context(), traceID)
	if err != nil {
		if op.RelayLogIsNotFound(err) {
			resp.Error(c, http.StatusNotFound, "trace not found")
			return
		}
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, detail)
}

func getLogDetail(c *gin.Context) {
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		resp.Error(c, http.StatusBadRequest, "invalid log id")
		return
	}

	relayLog, err := op.RelayLogGet(c.Request.Context(), id)
	if err != nil {
		if op.RelayLogIsNotFound(err) {
			resp.Error(c, http.StatusNotFound, "log not found")
			return
		}
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, relayLog)
}

func parseLogIntList(raw string) []int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]int, 0, len(parts))
	for _, part := range parts {
		value, err := strconv.Atoi(strings.TrimSpace(part))
		if err == nil && value > 0 {
			out = append(out, value)
		}
	}
	return out
}

func parseOptionalLogInt(raw string) *int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return nil
	}
	return &value
}

func parseOptionalLogBool(raw string) *bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "true", "1", "yes", "stream":
		value := true
		return &value
	case "false", "0", "no", "nonstream":
		value := false
		return &value
	default:
		return nil
	}
}

func clearLog(c *gin.Context) {
	if err := op.RelayLogClear(c.Request.Context()); err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, nil)
}

func getStreamToken(c *gin.Context) {
	token, err := op.RelayLogStreamTokenCreate()
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, gin.H{"token": token})
}

func streamLog(c *gin.Context) {
	token := c.Query("token")
	if token == "" || !op.RelayLogStreamTokenVerify(token) {
		resp.Error(c, http.StatusUnauthorized, "invalid stream token")
		return
	}

	op.RelayLogStreamTokenRevoke(token)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	logChan := op.RelayLogSubscribe()
	defer op.RelayLogUnsubscribe(logChan)

	ctx := c.Request.Context()

	for {
		select {
		case <-ctx.Done():
			return
		case log, ok := <-logChan:
			if !ok {
				return
			}
			data, err := json.Marshal(log)
			if err != nil {
				continue
			}
			c.Writer.Write([]byte(fmt.Sprintf("data: %s\n\n", data)))
			c.Writer.Flush()
		}
	}
}
