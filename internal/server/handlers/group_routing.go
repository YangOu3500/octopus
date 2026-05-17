package handlers

import (
	"net/http"
	"strconv"

	"github.com/bestruirui/octopus/internal/grouphealth"
	"github.com/bestruirui/octopus/internal/server/middleware"
	"github.com/bestruirui/octopus/internal/server/resp"
	"github.com/bestruirui/octopus/internal/server/router"
	"github.com/gin-gonic/gin"
)

func init() {
	router.NewGroupRouter("/api/v1/group/routing").
		Use(middleware.Auth()).
		AddRoute(
			router.NewRoute("/:id", http.MethodGet).
				Handle(getGroupRoutingPreview),
		)
}

func getGroupRoutingPreview(c *gin.Context) {
	groupID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		resp.InvalidParam(c)
		return
	}
	preview, err := grouphealth.BuildRoutingPreview(c.Request.Context(), groupID)
	if err != nil {
		resp.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	resp.Success(c, preview)
}
