package balancer

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
)

var ErrChannelConcurrencyQueueTimeout = errors.New("channel concurrency queue timeout")

const (
	ChannelConcurrencyModeLocal    = "local"
	ChannelConcurrencyModeDatabase = "database"

	defaultChannelConcurrencyLeaseTTL = 2 * time.Minute
)

type ChannelConcurrencyConfig struct {
	Enabled      bool
	Mode         string
	MaxInFlight  int
	QueueTimeout time.Duration
	LeaseTTL     time.Duration
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
	if release, ok := tryAcquireChannelConcurrencySlot(ctx, key, cfg); ok {
		return release, time.Since(startedAt), true
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
			if release, ok := tryAcquireChannelConcurrencySlot(ctx, key, cfg); ok {
				return release, time.Since(startedAt), true
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
	cfg := currentChannelConcurrencyConfig()
	if cfg.Mode == ChannelConcurrencyModeDatabase {
		return activeDatabaseChannelConcurrencyCount(channelID, strings.TrimSpace(modelName))
	}
	channelConcurrencyMu.Lock()
	defer channelConcurrencyMu.Unlock()
	return channelConcurrencyInFlight[healthKey{ChannelID: channelID, ModelName: strings.TrimSpace(modelName)}]
}

func CurrentChannelConcurrencyConfig() ChannelConcurrencyConfig {
	return currentChannelConcurrencyConfig()
}

func tryAcquireChannelConcurrencySlot(ctx context.Context, key healthKey, cfg ChannelConcurrencyConfig) (func(), bool) {
	switch cfg.Mode {
	case ChannelConcurrencyModeDatabase:
		return tryAcquireDatabaseChannelConcurrency(ctx, key, cfg)
	default:
		if tryAcquireLocalChannelConcurrency(key, cfg.MaxInFlight) {
			return releaseLocalChannelConcurrencyOnce(key), true
		}
		return func() {}, false
	}
}

func tryAcquireLocalChannelConcurrency(key healthKey, maxInFlight int) bool {
	channelConcurrencyMu.Lock()
	defer channelConcurrencyMu.Unlock()
	if channelConcurrencyInFlight[key] >= maxInFlight {
		return false
	}
	channelConcurrencyInFlight[key]++
	return true
}

func releaseLocalChannelConcurrencyOnce(key healthKey) func() {
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

func tryAcquireDatabaseChannelConcurrency(ctx context.Context, key healthKey, cfg ChannelConcurrencyConfig) (func(), bool) {
	conn := db.GetDB()
	if conn == nil {
		return func() {}, false
	}
	now := time.Now()
	leaseTTL := cfg.LeaseTTL
	if leaseTTL <= 0 {
		leaseTTL = defaultChannelConcurrencyLeaseTTL
	}
	nowMS := now.UnixMilli()
	_ = conn.WithContext(ctx).
		Where("channel_id = ? AND model_name = ? AND expires_at <= ?", key.ChannelID, key.ModelName, nowMS).
		Delete(&model.ChannelConcurrencyLease{}).Error

	for slot := 1; slot <= cfg.MaxInFlight; slot++ {
		token := channelConcurrencyLeaseToken()
		lease := model.ChannelConcurrencyLease{
			ChannelID:  key.ChannelID,
			ModelName:  key.ModelName,
			Slot:       slot,
			LeaseToken: token,
			AcquiredAt: nowMS,
			ExpiresAt:  now.Add(leaseTTL).UnixMilli(),
		}
		if err := conn.WithContext(ctx).Create(&lease).Error; err != nil {
			continue
		}
		return releaseDatabaseChannelConcurrencyOnce(ctx, token, leaseTTL), true
	}
	return func() {}, false
}

func releaseDatabaseChannelConcurrencyOnce(ctx context.Context, token string, leaseTTL time.Duration) func() {
	var once sync.Once
	stop := make(chan struct{})
	go renewDatabaseChannelConcurrencyLease(ctx, token, leaseTTL, stop)
	return func() {
		once.Do(func() {
			close(stop)
			conn := db.GetDB()
			if conn == nil {
				return
			}
			releaseCtx := context.Background()
			if ctx != nil && ctx.Err() == nil {
				releaseCtx = ctx
			}
			_ = conn.WithContext(releaseCtx).Where("lease_token = ?", token).Delete(&model.ChannelConcurrencyLease{}).Error
		})
	}
}

func renewDatabaseChannelConcurrencyLease(ctx context.Context, token string, leaseTTL time.Duration, stop <-chan struct{}) {
	if ctx == nil {
		ctx = context.Background()
	}
	if leaseTTL <= 0 {
		leaseTTL = defaultChannelConcurrencyLeaseTTL
	}
	interval := leaseTTL / 2
	if interval < time.Second {
		interval = time.Second
	}
	if interval > 30*time.Second {
		interval = 30 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			conn := db.GetDB()
			if conn == nil {
				return
			}
			expiresAt := time.Now().Add(leaseTTL).UnixMilli()
			_ = conn.WithContext(ctx).
				Model(&model.ChannelConcurrencyLease{}).
				Where("lease_token = ?", token).
				Update("expires_at", expiresAt).Error
		}
	}
}

func activeDatabaseChannelConcurrencyCount(channelID int, modelName string) int {
	conn := db.GetDB()
	if conn == nil {
		return 0
	}
	nowMS := time.Now().UnixMilli()
	_ = conn.
		Where("channel_id = ? AND model_name = ? AND expires_at <= ?", channelID, modelName, nowMS).
		Delete(&model.ChannelConcurrencyLease{}).Error
	var count int64
	if err := conn.Model(&model.ChannelConcurrencyLease{}).
		Where("channel_id = ? AND model_name = ? AND expires_at > ?", channelID, modelName, nowMS).
		Count(&count).Error; err != nil {
		return 0
	}
	return int(count)
}

func channelConcurrencyLeaseToken() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

func currentChannelConcurrencyConfig() ChannelConcurrencyConfig {
	if channelConcurrencyConfigOverride != nil {
		return normalizeChannelConcurrencyConfig(*channelConcurrencyConfigOverride)
	}
	enabled, err := op.SettingGetBool(model.SettingKeyChannelConcurrencyEnabled)
	if err != nil {
		enabled = false
	}
	mode, err := op.SettingGetString(model.SettingKeyChannelConcurrencyMode)
	if err != nil {
		mode = ChannelConcurrencyModeLocal
	}
	maxInFlight := settingInt(model.SettingKeyChannelConcurrencyMax, 1)
	queueTimeoutMS, err := op.SettingGetInt(model.SettingKeyChannelConcurrencyQueueMS)
	if err != nil || queueTimeoutMS < 0 {
		queueTimeoutMS = 1000
	}
	leaseTTLMS, err := op.SettingGetInt(model.SettingKeyChannelConcurrencyLeaseMS)
	if err != nil || leaseTTLMS <= 0 {
		leaseTTLMS = int(defaultChannelConcurrencyLeaseTTL / time.Millisecond)
	}
	return normalizeChannelConcurrencyConfig(ChannelConcurrencyConfig{
		Enabled:      enabled,
		Mode:         mode,
		MaxInFlight:  maxInFlight,
		QueueTimeout: time.Duration(queueTimeoutMS) * time.Millisecond,
		LeaseTTL:     time.Duration(leaseTTLMS) * time.Millisecond,
	})
}

func normalizeChannelConcurrencyConfig(cfg ChannelConcurrencyConfig) ChannelConcurrencyConfig {
	cfg.Mode = strings.ToLower(strings.TrimSpace(cfg.Mode))
	if cfg.Mode == "" {
		cfg.Mode = ChannelConcurrencyModeLocal
	}
	switch cfg.Mode {
	case ChannelConcurrencyModeLocal, ChannelConcurrencyModeDatabase:
	default:
		cfg.Mode = ChannelConcurrencyModeLocal
	}
	if cfg.MaxInFlight <= 0 {
		cfg.MaxInFlight = 1
	}
	if cfg.QueueTimeout < 0 {
		cfg.QueueTimeout = time.Second
	}
	if cfg.LeaseTTL <= 0 {
		cfg.LeaseTTL = defaultChannelConcurrencyLeaseTTL
	}
	return cfg
}

func resetChannelConcurrencyState() {
	channelConcurrencyMu.Lock()
	defer channelConcurrencyMu.Unlock()
	channelConcurrencyInFlight = make(map[healthKey]int)
	channelConcurrencyConfigOverride = nil
}
