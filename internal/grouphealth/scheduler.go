package grouphealth

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
	"github.com/bestruirui/octopus/internal/relay/balancer"
	"gorm.io/gorm"
)

type ProbeConfig struct {
	Enabled                 bool
	SiteMinInterval         time.Duration
	ModelMinInterval        time.Duration
	MaxConcurrency          int
	DailyMaxRequestsPerSite int
	Prompt                  string
	MaxTokens               int64
	Temperature             float64
	JitterRatio             float64
}

type SlowProbeScheduler struct {
	repo   Repository
	prober *Prober

	mu                   sync.Mutex
	nextSiteProbeAt      map[string]time.Time
	nextSiteModelProbeAt map[siteModelProbeKey]time.Time
	dailyRequests        map[dailyProbeKey]int
	backoffs             map[candidateProbeKey]probeBackoff
	rng                  *rand.Rand
	now                  func() time.Time
}

type slowProbeJob struct {
	group   model.Group
	item    model.GroupItem
	channel model.Channel
	usedKey model.ChannelKey
	binding *model.SiteChannelBinding
}

type siteModelProbeKey struct {
	SiteKey   string
	ModelName string
}

type dailyProbeKey struct {
	SiteKey string
	Day     string
}

type candidateProbeKey struct {
	ChannelID    int
	ChannelKeyID int
	ModelName    string
}

type probeBackoff struct {
	Until       time.Time
	Failures    int
	LastFailure time.Time
}

type candidateProbeState string

const (
	candidateProbeUnknown  candidateProbeState = "unknown"
	candidateProbeHealthy  candidateProbeState = "healthy"
	candidateProbeDegraded candidateProbeState = "degraded"
)

func NewSlowProbeScheduler(repo Repository, prober *Prober) *SlowProbeScheduler {
	if repo == nil {
		repo = op.NewGroupHealthRepository()
	}
	if prober == nil {
		prober = NewProber()
	}
	return &SlowProbeScheduler{
		repo:                 repo,
		prober:               prober,
		nextSiteProbeAt:      make(map[string]time.Time),
		nextSiteModelProbeAt: make(map[siteModelProbeKey]time.Time),
		dailyRequests:        make(map[dailyProbeKey]int),
		backoffs:             make(map[candidateProbeKey]probeBackoff),
		rng:                  rand.New(rand.NewSource(time.Now().UnixNano())),
		now:                  time.Now,
	}
}

func ProbeConfigFromSettings() ProbeConfig {
	return ProbeConfig{
		Enabled:                 settingBool(model.SettingKeyProbeEnabled, false),
		SiteMinInterval:         time.Duration(settingIntWithFallback(model.SettingKeyProbeSiteMinInterval, 30)) * time.Minute,
		ModelMinInterval:        time.Duration(settingIntWithFallback(model.SettingKeyProbeModelMinInterval, 12)) * time.Hour,
		MaxConcurrency:          settingIntWithFallback(model.SettingKeyProbeMaxConcurrency, 1),
		DailyMaxRequestsPerSite: settingIntWithFallback(model.SettingKeyProbeDailyMaxRequests, 20),
		Prompt:                  settingString(model.SettingKeyProbePrompt, "只回复 OK"),
		MaxTokens:               int64(settingIntWithFallback(model.SettingKeyProbeMaxTokens, 8)),
		Temperature:             settingFloat(model.SettingKeyProbeTemperature, 0),
		JitterRatio:             settingFloat(model.SettingKeyProbeJitterRatio, 0.25),
	}
}

func (s *SlowProbeScheduler) RunOnce(ctx context.Context) error {
	return s.RunOnceWithConfig(ctx, ProbeConfigFromSettings())
}

func (s *SlowProbeScheduler) RunOnceWithConfig(ctx context.Context, cfg ProbeConfig) error {
	cfg = normalizeProbeConfig(cfg)
	if !cfg.Enabled {
		return nil
	}

	groups, err := op.GroupList(ctx)
	if err != nil {
		return err
	}

	jobs, err := s.planJobs(ctx, groups, cfg, s.currentTime())
	if err != nil {
		return err
	}
	if len(jobs) == 0 {
		return nil
	}

	maxConcurrency := cfg.MaxConcurrency
	if maxConcurrency <= 0 {
		maxConcurrency = 1
	}
	sem := make(chan struct{}, maxConcurrency)
	var wg sync.WaitGroup
	for _, job := range jobs {
		job := job
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			s.runJob(ctx, cfg, job)
		}()
	}
	wg.Wait()
	return nil
}

func (s *SlowProbeScheduler) planJobs(ctx context.Context, groups []model.Group, cfg ProbeConfig, now time.Time) ([]slowProbeJob, error) {
	jobs := make([]slowProbeJob, 0, len(groups))
	for _, group := range groups {
		items := append([]model.GroupItem(nil), group.Items...)
		sort.Slice(items, func(i, j int) bool {
			if items[i].Priority != items[j].Priority {
				return items[i].Priority < items[j].Priority
			}
			if items[i].Weight != items[j].Weight {
				return items[i].Weight > items[j].Weight
			}
			if items[i].ChannelID != items[j].ChannelID {
				return items[i].ChannelID < items[j].ChannelID
			}
			return items[i].ID < items[j].ID
		})
		if len(items) == 0 {
			continue
		}

		latest, err := s.repo.GetLatestSnapshotByGroupID(ctx, group.ID)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}

		bindings, err := bindingsByItems(ctx, items)
		if err != nil {
			return nil, err
		}

		for _, item := range items {
			channel, err := op.ChannelGet(item.ChannelID, ctx)
			if err != nil || channel == nil || !channel.Enabled {
				continue
			}
			usedKey := channel.GetChannelKey()
			if usedKey.ID == 0 || strings.TrimSpace(usedKey.ChannelKey) == "" {
				continue
			}
			binding := bindingPointer(bindings, item.ChannelID)
			shouldProbe, err := s.shouldProbeCandidate(ctx, cfg, now, item, *channel, usedKey, binding, latest)
			if err != nil {
				return nil, err
			}
			if !shouldProbe {
				continue
			}
			jobs = append(jobs, slowProbeJob{
				group:   group,
				item:    item,
				channel: *channel,
				usedKey: usedKey,
				binding: binding,
			})
			break
		}
	}
	return jobs, nil
}

func (s *SlowProbeScheduler) shouldProbeCandidate(ctx context.Context, cfg ProbeConfig, now time.Time, item model.GroupItem, channel model.Channel, usedKey model.ChannelKey, binding *model.SiteChannelBinding, latest *model.GroupHealthSnapshot) (bool, error) {
	if binding != nil {
		disabled, err := siteModelDisabled(ctx, *binding, item.ModelName)
		if err != nil {
			return false, err
		}
		if disabled {
			return false, nil
		}
	}

	if cooling, _, _ := balancer.IsHealthCoolingDown(channel.ID, usedKey.ID, item.ModelName, channel.GetBaseUrl()); cooling {
		return false, nil
	}

	state, lastProbeAt := candidateState(latest, item)
	if state != candidateProbeUnknown && cfg.ModelMinInterval > 0 && now.Sub(lastProbeAt) < cfg.ModelMinInterval {
		return false, nil
	}
	if state == candidateProbeHealthy && cfg.ModelMinInterval <= 0 {
		return false, nil
	}

	return s.reserveCandidateProbe(now, cfg, item, channel, usedKey, binding), nil
}

func (s *SlowProbeScheduler) reserveCandidateProbe(now time.Time, cfg ProbeConfig, item model.GroupItem, channel model.Channel, usedKey model.ChannelKey, binding *model.SiteChannelBinding) bool {
	if cfg.DailyMaxRequestsPerSite <= 0 {
		return false
	}
	siteKey := probeSiteKey(binding, channel.ID)
	modelKey := siteModelProbeKey{SiteKey: siteKey, ModelName: strings.TrimSpace(item.ModelName)}
	dailyKey := dailyProbeKey{SiteKey: siteKey, Day: now.Format("2006-01-02")}
	backoffKey := candidateProbeKey{ChannelID: channel.ID, ChannelKeyID: usedKey.ID, ModelName: strings.TrimSpace(item.ModelName)}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.cleanupOldDailyCountersLocked(dailyKey.Day)

	if next := s.nextSiteProbeAt[siteKey]; next.After(now) {
		return false
	}
	if next := s.nextSiteModelProbeAt[modelKey]; next.After(now) {
		return false
	}
	if backoff := s.backoffs[backoffKey]; backoff.Until.After(now) {
		return false
	}
	if s.dailyRequests[dailyKey] >= cfg.DailyMaxRequestsPerSite {
		return false
	}

	s.dailyRequests[dailyKey]++
	if cfg.SiteMinInterval > 0 {
		s.nextSiteProbeAt[siteKey] = now.Add(s.jitterLocked(cfg.SiteMinInterval, cfg.JitterRatio))
	}
	if cfg.ModelMinInterval > 0 {
		s.nextSiteModelProbeAt[modelKey] = now.Add(s.jitterLocked(cfg.ModelMinInterval, cfg.JitterRatio))
	}
	return true
}

func (s *SlowProbeScheduler) runJob(ctx context.Context, cfg ProbeConfig, job slowProbeJob) {
	unlock := lockGroup(job.group.ID)
	defer unlock()

	if _, err := s.repo.GetRunningSnapshotByGroupID(ctx, job.group.ID); err == nil {
		return
	}

	snapshot, err := s.repo.CreateRunningSnapshot(ctx, job.group)
	if err != nil {
		return
	}

	startedAt := s.currentTime()
	result := s.prober.RunCandidateWithOptions(ctx, job.channel, job.usedKey, job.item.ModelName, ProbeOptions{
		Prompt:      cfg.Prompt,
		MaxTokens:   cfg.MaxTokens,
		Temperature: cfg.Temperature,
	})
	finishedAt := s.currentTime()

	attempt := model.GroupHealthAttempt{
		GroupItemID:  job.item.ID,
		ChannelID:    job.item.ChannelID,
		ChannelName:  job.channel.Name,
		ChannelKeyID: job.usedKey.ID,
		KeyRemark:    job.usedKey.Remark,
		ModelName:    job.item.ModelName,
		Priority:     job.item.Priority,
		Weight:       job.item.Weight,
		HTTPStatus:   result.HTTPStatus,
		DurationMS:   result.DurationMS,
		ErrorMessage: result.ErrorMessage,
	}
	finalStatus := model.GroupHealthStatusFailed
	message := "slow probe candidate failed"
	var successfulChannelID *int
	if result.Success {
		attempt.Status = model.GroupHealthAttemptStatusSuccess
		finalStatus = model.GroupHealthStatusSuccess
		successfulChannelID = &job.item.ChannelID
		message = "slow probe candidate succeeded"
	} else {
		attempt.Status = model.GroupHealthAttemptStatusFailed
	}

	if err := s.repo.AppendAttempt(ctx, snapshot.ID, attempt); err != nil {
		return
	}
	_ = s.repo.FinishSnapshot(ctx, snapshot.ID, finalStatus, successfulChannelID, finishedAt.Sub(startedAt).Milliseconds(), message, finishedAt)
	s.recordCandidateResult(cfg, job, result, finishedAt)
}

func (s *SlowProbeScheduler) recordCandidateResult(cfg ProbeConfig, job slowProbeJob, result ProbeResult, now time.Time) {
	key := candidateProbeKey{ChannelID: job.channel.ID, ChannelKeyID: job.usedKey.ID, ModelName: strings.TrimSpace(job.item.ModelName)}

	s.mu.Lock()
	defer s.mu.Unlock()

	if result.Success {
		delete(s.backoffs, key)
		return
	}

	backoff := s.backoffs[key]
	if now.Sub(backoff.LastFailure) > 24*time.Hour {
		backoff.Failures = 0
	}
	backoff.Failures++
	backoff.LastFailure = now
	base := cfg.SiteMinInterval
	if base <= 0 {
		base = 30 * time.Minute
	}
	shift := backoff.Failures - 1
	if shift > 5 {
		shift = 5
	}
	duration := base * time.Duration(1<<shift)
	capDuration := cfg.ModelMinInterval
	if capDuration <= 0 {
		capDuration = 12 * time.Hour
	}
	if duration > capDuration {
		duration = capDuration
	}
	backoff.Until = now.Add(s.jitterLocked(duration, cfg.JitterRatio))
	s.backoffs[key] = backoff
}

func (s *SlowProbeScheduler) cleanupOldDailyCountersLocked(currentDay string) {
	for key := range s.dailyRequests {
		if key.Day != currentDay {
			delete(s.dailyRequests, key)
		}
	}
}

func (s *SlowProbeScheduler) jitterLocked(duration time.Duration, ratio float64) time.Duration {
	if duration <= 0 || ratio <= 0 {
		return duration
	}
	if ratio > 1 {
		ratio = 1
	}
	return duration + time.Duration(s.rng.Float64()*ratio*float64(duration))
}

func (s *SlowProbeScheduler) currentTime() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

func bindingsByItems(ctx context.Context, items []model.GroupItem) (map[int]model.SiteChannelBinding, error) {
	channelIDs := make([]int, 0, len(items))
	seen := make(map[int]struct{}, len(items))
	for _, item := range items {
		if _, ok := seen[item.ChannelID]; ok {
			continue
		}
		seen[item.ChannelID] = struct{}{}
		channelIDs = append(channelIDs, item.ChannelID)
	}
	return op.SiteChannelBindingMapByChannelIDs(channelIDs, ctx)
}

func bindingPointer(bindings map[int]model.SiteChannelBinding, channelID int) *model.SiteChannelBinding {
	binding, ok := bindings[channelID]
	if !ok {
		return nil
	}
	return &binding
}

func siteModelDisabled(ctx context.Context, binding model.SiteChannelBinding, modelName string) (bool, error) {
	groupKey, _ := model.ParseSiteChannelBindingKey(binding.GroupKey)
	return op.SiteModelIsDisabled(binding.SiteAccountID, groupKey, modelName, ctx)
}

func candidateState(snapshot *model.GroupHealthSnapshot, item model.GroupItem) (candidateProbeState, time.Time) {
	if snapshot == nil {
		return candidateProbeUnknown, time.Time{}
	}
	probedAt := snapshot.StartedAt
	if snapshot.FinishedAt != nil {
		probedAt = *snapshot.FinishedAt
	}
	for _, attempt := range snapshot.Attempts {
		if attempt.GroupItemID != item.ID && (attempt.ChannelID != item.ChannelID || attempt.ModelName != item.ModelName) {
			continue
		}
		switch attempt.Status {
		case model.GroupHealthAttemptStatusSuccess:
			return candidateProbeHealthy, probedAt
		case model.GroupHealthAttemptStatusFailed:
			return candidateProbeDegraded, probedAt
		default:
			return candidateProbeUnknown, probedAt
		}
	}
	return candidateProbeUnknown, probedAt
}

func probeSiteKey(binding *model.SiteChannelBinding, channelID int) string {
	if binding != nil && binding.SiteID > 0 {
		return fmt.Sprintf("site:%d", binding.SiteID)
	}
	return fmt.Sprintf("channel:%d", channelID)
}

func normalizeProbeConfig(cfg ProbeConfig) ProbeConfig {
	if cfg.MaxConcurrency <= 0 {
		cfg.MaxConcurrency = 1
	}
	if cfg.DailyMaxRequestsPerSite < 0 {
		cfg.DailyMaxRequestsPerSite = 0
	}
	if strings.TrimSpace(cfg.Prompt) == "" {
		cfg.Prompt = "只回复 OK"
	}
	if cfg.MaxTokens <= 0 {
		cfg.MaxTokens = 8
	}
	cfg.Temperature = math.Max(0, math.Min(2, cfg.Temperature))
	cfg.JitterRatio = math.Max(0, math.Min(1, cfg.JitterRatio))
	return cfg
}

func settingBool(key model.SettingKey, fallback bool) bool {
	value, err := op.SettingGetBool(key)
	if err != nil {
		return fallback
	}
	return value
}

func settingIntWithFallback(key model.SettingKey, fallback int) int {
	value, err := op.SettingGetInt(key)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func settingString(key model.SettingKey, fallback string) string {
	value, err := op.SettingGetString(key)
	if err != nil || strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func settingFloat(key model.SettingKey, fallback float64) float64 {
	value, err := op.SettingGetString(key)
	if err != nil || strings.TrimSpace(value) == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}
