package task

import (
	"context"

	"github.com/bestruirui/octopus/internal/grouphealth"
	"github.com/bestruirui/octopus/internal/utils/log"
)

var defaultSlowProbeScheduler = grouphealth.NewSlowProbeScheduler(nil, nil)

func SlowProbeTask() {
	if err := defaultSlowProbeScheduler.RunOnce(context.Background()); err != nil {
		log.Warnf("slow probe task failed: %v", err)
	}
}
