package relay

import (
	"context"
	"net/http"
	"strings"

	dbmodel "github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/utils/log"
)

const rawDebugTokenHeader = "X-Octopus-Raw-Debug-Token"

func rawDebugSessionFromHeaders(ctx context.Context, headers http.Header) (dbmodel.RawDebugSession, bool) {
	token := strings.TrimSpace(headers.Get(rawDebugTokenHeader))
	if token == "" {
		return dbmodel.RawDebugSession{}, false
	}
	session, ok, err := op.RawDebugSessionVerify(ctx, token)
	if err != nil {
		log.Warnf("raw debug session verification failed: %v", err)
		return dbmodel.RawDebugSession{}, false
	}
	return session, ok
}

func enableRawDebugFromHeaders(ctx context.Context, metrics *RelayMetrics, headers http.Header) {
	if metrics == nil {
		return
	}
	if session, ok := rawDebugSessionFromHeaders(ctx, headers); ok {
		metrics.EnableRawDebug(session, headers)
	}
}
