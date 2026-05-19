package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/server/middleware"
	"github.com/bestruirui/octopus/internal/server/resp"
	"github.com/bestruirui/octopus/internal/server/router"
	"github.com/gin-gonic/gin"
)

type rawDebugCreateSessionRequest struct {
	Scope  string `json:"scope"`
	Reason string `json:"reason"`
}

type rawDebugRevokeSessionRequest struct {
	SessionID int64  `json:"session_id"`
	Token     string `json:"token"`
}

func init() {
	router.NewGroupRouter("/api/v1/log/raw-debug").
		Use(middleware.Auth()).
		AddRoute(
			router.NewRoute("/config", http.MethodGet).
				Handle(getRawDebugConfig),
		).
		AddRoute(
			router.NewRoute("/sessions", http.MethodGet).
				Handle(listRawDebugSessions),
		).
		AddRoute(
			router.NewRoute("/session", http.MethodPost).
				Use(middleware.RequireJSON()).
				Handle(createRawDebugSession),
		).
		AddRoute(
			router.NewRoute("/revoke", http.MethodPost).
				Use(middleware.RequireJSON()).
				Handle(revokeRawDebugSession),
		).
		AddRoute(
			router.NewRoute("/audit", http.MethodGet).
				Handle(listRawDebugAudit),
		)
}

func getRawDebugConfig(c *gin.Context) {
	resp.Success(c, op.RawDebugConfigFromSettings())
}

func createRawDebugSession(c *gin.Context) {
	var req rawDebugCreateSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.InvalidJSON(c)
		return
	}

	user := op.UserGet()
	authz, err := op.RawDebugSessionCreate(c.Request.Context(), model.RawDebugSessionCreateRequest{
		ActorUserID: int(user.ID),
		ActorName:   user.Username,
		Scope:       req.Scope,
		Reason:      req.Reason,
	})
	if err != nil {
		resp.Error(c, http.StatusBadRequest, err.Error())
		return
	}
	resp.Success(c, authz)
}

func revokeRawDebugSession(c *gin.Context) {
	var req rawDebugRevokeSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.InvalidJSON(c)
		return
	}

	user := op.UserGet()
	var (
		ok  bool
		err error
	)
	if req.SessionID > 0 {
		ok, err = op.RawDebugSessionRevokeByID(c.Request.Context(), req.SessionID, int(user.ID), user.Username)
	} else {
		ok, err = op.RawDebugSessionRevoke(c.Request.Context(), req.Token, int(user.ID), user.Username)
	}
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		resp.Error(c, http.StatusNotFound, "raw debug session not found or inactive")
		return
	}
	resp.Success(c, gin.H{"revoked": true})
}

func listRawDebugSessions(c *gin.Context) {
	query := model.RawDebugSessionListQuery{
		Page:      parseRawDebugInt(c.DefaultQuery("page", "1")),
		PageSize:  parseRawDebugInt(c.DefaultQuery("page_size", "20")),
		Status:    c.Query("status"),
		Scope:     c.Query("scope"),
		ActorName: c.Query("actor_name"),
		SortOrder: c.Query("sort_order"),
	}
	if start := parseOptionalRawDebugInt(c.Query("start_time")); start != nil {
		query.StartTime = start
	}
	if end := parseOptionalRawDebugInt(c.Query("end_time")); end != nil {
		query.EndTime = end
	}

	result, err := op.RawDebugSessionList(c.Request.Context(), query)
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, result)
}

func listRawDebugAudit(c *gin.Context) {
	query := model.RawDebugAuditListQuery{
		Page:       parseRawDebugInt(c.DefaultQuery("page", "1")),
		PageSize:   parseRawDebugInt(c.DefaultQuery("page_size", "20")),
		SessionID:  int64(parseRawDebugInt(c.Query("session_id"))),
		Action:     c.Query("action"),
		TargetType: c.Query("target_type"),
		Scope:      c.Query("scope"),
		ActorName:  c.Query("actor_name"),
		SortOrder:  c.Query("sort_order"),
	}
	if success := parseOptionalRawDebugBool(c.Query("success")); success != nil {
		query.Success = success
	}
	if start := parseOptionalRawDebugInt(c.Query("start_time")); start != nil {
		query.StartTime = start
	}
	if end := parseOptionalRawDebugInt(c.Query("end_time")); end != nil {
		query.EndTime = end
	}

	result, err := op.RawDebugAuditList(c.Request.Context(), query)
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, result)
}

func parseRawDebugInt(raw string) int {
	value, _ := strconv.Atoi(strings.TrimSpace(raw))
	return value
}

func parseOptionalRawDebugInt(raw string) *int {
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

func parseOptionalRawDebugBool(raw string) *bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "true", "1", "yes":
		value := true
		return &value
	case "false", "0", "no":
		value := false
		return &value
	default:
		return nil
	}
}
