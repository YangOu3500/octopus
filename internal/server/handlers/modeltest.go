package handlers

import (
	"errors"
	"net/http"

	"github.com/bestruirui/octopus/internal/modeltest"
	"github.com/bestruirui/octopus/internal/server/middleware"
	"github.com/bestruirui/octopus/internal/server/resp"
	"github.com/bestruirui/octopus/internal/server/router"
	"github.com/gin-gonic/gin"
)

var defaultModelTestService = modeltest.NewService(nil)

func init() {
	router.NewGroupRouter("/api/v1/model-test").
		Use(middleware.Auth()).
		Use(middleware.RequireJSON()).
		AddRoute(
			router.NewRoute("/run", http.MethodPost).
				Handle(runModelTest),
		)
}

func runModelTest(c *gin.Context) {
	var req modeltest.RunRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		resp.InvalidJSON(c)
		return
	}
	result, err := defaultModelTestService.Run(c.Request.Context(), req)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, modeltest.ErrInvalidRequest) {
			status = http.StatusBadRequest
		}
		resp.Error(c, status, err.Error())
		return
	}
	resp.Success(c, result)
}
