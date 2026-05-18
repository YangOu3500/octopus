package balancer

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
)

var ErrChannelConcurrencyQueueTimeout = errors.New("channel concurrency queue timeout")

type ChannelConcurrencyConfig struct {
	Enabled      bool
	MaxInFlight  int
	QueueTimeout time.Duration
}

var (
	channelConcurrencyMu             sync.Mutex
	channelConcurrencyInFlight       = make(map[healthKey]int)
	channelConcurrencyConfigOverride *ChannelConcurrencyConfig
)

func AcquireChannelConcurrency(ctx context.Context, channelID int, modelName string) (func(), time.Duration, bool) {
	cfg := currentChannelConcurrencyConfig()
	if !cfg.Enabled || cfg.MaxInFlight <= 0 || channelID <= 0 || strings.TrimSpace(modelName) == "" {
		return func() {}, 0, true
	}
	if ctx == nil {
		ctx = context.Background()
	}

	key := healthKey{ChannelID: channelID, ModelName: strings.TrimSpace(modelName)}
	startedAt := time.Now()
	if tryAcquireChannelConcurrency(key, cfg.MaxInFlight) {
		return releaseChannelConcurrencyOnce(key), time.Since(startedAt), true
	}
	if cfg.QueueTimeout <= 0 {
		return func() {}, time.Since(startedAt), false
	}

	timer := time.NewTimer(cfg.QueueTimeout)
	ticker := time.NewTicker(20 * time.Millisecond)
	defer timer.Stop()
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return func() {}, time.Since(startedAt), false
		case <-timer.C:
			return func() {}, time.Since(startedAt), false
		case <-ticker.C:
			if tryAcquireChannelConcurrency(key, cfg.MaxInFlight) {
				return releaseChannelConcurrencyOnce(key), time.Since(startedAt), true
			}
		}
	}
}

func IsChannelConcurrencyLimitError(err error) bool {
	return errors.Is(err, ErrChannelConcurrencyQueueTimeout)
}

func ActiveChannelConcurrencyCount(channelID int, modelName string) int {
	if channelID <= 0 || strings.TrimSpace(modelName) == "" {
		return 0
	}
	channelConcurrencyMu.Lock()
	defer channelConcurrencyMu.Unlock()
	return channelConcurrencyInFlight[healthKey{ChannelID: channelID, ModelName: strings.TrimSpace(modelName)}]
}

func CurrentChannelConcurrencyConfig() ChannelConcurrencyConfig {
	return currentChannelConcurrencyConfig()
}

func tryAcquireChannelConcurrency(key healthKey, maxInFlight int) bool {
	channelConcurrencyMu.Lock()
	defer channelConcurrencyMu.Unlock()
	if channelConcurrencyInFlight[key] >= maxInFlight {
		return false
	}
	channelConcurrencyInFlight[key]++
	return true
}

func releaseChannelConcurrencyOnce(key healthKey) func() {
	var once sync.Once
	return func() {
		once.Do(func() {
			channelConcurrencyMu.Lock()
			defer channelConcurrencyMu.Unlock()
			count := channelConcurrencyInFlight[key]
			if count <= 1 {
				delete(channelConcurrencyInFlight, key)
				return
			}
			channelConcurrencyInFlight[key] = count - 1
		})
	}
}

func currentChannelConcurrencyConfig() ChannelConcurrencyConfig {
	if channelConcurrencyConfigOverride != nil {
		return *channelConcurrencyConfigOverride
	}
	enabled, err := op.SettingGetBool(model.SettingKeyChannelConcurrencyEnabled)
	if err != nil {
		enabled = false
	}
	maxInFlight := settingInt(model.SettingKeyChannelConcurrencyMax, 1)
	queueTimeoutMS, err := op.SettingGetInt(model.SettingKeyChannelConcurrencyQueueMS)
	if err != nil || queueTimeoutMS < 0 {
		queueTimeoutMS = 1000
	}
	return ChannelConcurrencyConfig{
		Enabled:      enabled,
		MaxInFlight:  maxInFlight,
		QueueTimeout: time.Duration(queueTimeoutMS) * time.Millisecond,
	}
}

func resetChannelConcurrencyState() {
	channelConcurrencyMu.Lock()
	defer channelConcurrencyMu.Unlock()
	channelConcurrencyInFlight = make(map[healthKey]int)
	channelConcurrencyConfigOverride = nil
}
