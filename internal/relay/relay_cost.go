package relay

import (
	"strings"

	"github.com/bestruirui/octopus/internal/utils/log"
)

func (ra *relayAttempt) collectResponse() {
	if ra == nil || ra.inAdapter == nil || ra.metrics == nil {
		return
	}
	internalResponse, err := ra.inAdapter.GetInternalResponse(ra.requestContext())
	if err != nil {
		log.Debugf("collectResponse: failed to get internal response: %v", err)
		return
	}
	if internalResponse == nil {
		log.Debugf("collectResponse: internal response is nil (stream may not be complete)")
		return
	}

	actualModel := strings.TrimSpace(internalResponse.Model)
	if actualModel == "" && ra.internalRequest != nil {
		actualModel = strings.TrimSpace(ra.internalRequest.Model)
	}
	if ra.channel != nil {
		ra.metrics.SetSelectedChannel(ra.channel.ID)
	}
	ra.metrics.SetInternalResponse(internalResponse, actualModel)
}

// shouldPassthroughAnthropic 判定是否走 Anthropic→Anthropic 原生直通路径。
