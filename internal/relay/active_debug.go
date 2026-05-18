package relay

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	dbmodel "github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
)

const (
	activeRequestMaxItems        = 512
	activeRequestTTL             = 2 * time.Hour
	activeRequestEventBuf        = 64
	activeRequestPreviewMaxRunes = 4096
)

var (
	activeRequests   = newActiveRequestTracker(activeRequestMaxItems, activeRequestTTL)
	activeRequestSeq atomic.Uint64
)

type ActiveRequestSnapshot struct {
	ID                         string `json:"id"`
	APIKeyID                   int    `json:"api_key_id,omitempty"`
	GroupID                    int    `json:"group_id,omitempty"`
	RequestModel               string `json:"request_model"`
	RequestSource              string `json:"request_source,omitempty"`
	RequestStream              bool   `json:"request_stream"`
	ClientIP                   string `json:"client_ip,omitempty"`
	StartedAt                  int64  `json:"started_at"`
	UpdatedAt                  int64  `json:"updated_at"`
	ElapsedMS                  int64  `json:"elapsed_ms"`
	Phase                      string `json:"phase"`
	ChannelID                  int    `json:"channel_id,omitempty"`
	ChannelName                string `json:"channel_name,omitempty"`
	ChannelKeyID               int    `json:"channel_key_id,omitempty"`
	ModelName                  string `json:"model_name,omitempty"`
	SiteID                     int    `json:"site_id,omitempty"`
	SiteAccountID              int    `json:"site_account_id,omitempty"`
	QuotaStatus                string `json:"quota_status,omitempty"`
	QuotaReason                string `json:"quota_reason,omitempty"`
	CapacityStatus             string `json:"capacity_status,omitempty"`
	CapacityReason             string `json:"capacity_reason,omitempty"`
	CapacityScope              string `json:"capacity_scope,omitempty"`
	CapacitySource             string `json:"capacity_source,omitempty"`
	LastObservedAt             int64  `json:"last_observed_at,omitempty"`
	ExpiresAt                  int64  `json:"expires_at,omitempty"`
	ChannelConcurrencyMode     string `json:"channel_concurrency_mode,omitempty"`
	ChannelConcurrencyLimit    int    `json:"channel_concurrency_limit,omitempty"`
	ChannelConcurrencyWaitMS   int    `json:"channel_concurrency_wait_ms,omitempty"`
	ChannelConcurrencyAcquired bool   `json:"channel_concurrency_acquired"`
	ChannelConcurrencyTimedOut bool   `json:"channel_concurrency_timed_out"`
	AttemptsCount              int    `json:"attempts_count,omitempty"`
	LastStatus                 string `json:"last_status,omitempty"`
	LastHTTPStatus             int    `json:"last_http_status,omitempty"`
	LastFailureReason          string `json:"last_failure_reason,omitempty"`
	RequestPreview             string `json:"request_preview,omitempty"`
	ResponsePreview            string `json:"response_preview,omitempty"`
	Written                    bool   `json:"written"`
	FirstTokenSeen             bool   `json:"first_token_seen"`
	UsedWS                     bool   `json:"used_ws"`
}

type ActiveRequestList struct {
	Total     int                     `json:"total"`
	UpdatedAt int64                   `json:"updated_at"`
	Items     []ActiveRequestSnapshot `json:"items"`
}

type ActiveRequestEvent struct {
	Type      string                 `json:"type"`
	UpdatedAt int64                  `json:"updated_at"`
	Snapshot  *ActiveRequestSnapshot `json:"snapshot,omitempty"`
	List      *ActiveRequestList     `json:"list,omitempty"`
}

type activeAttemptInfo struct {
	ChannelID     int
	ChannelName   string
	ChannelKeyID  int
	ModelName     string
	SiteID        int
	SiteAccountID int
	AttemptMeta   dbmodel.AttemptCapacityMeta
	AttemptCount  int
}

type activeRequestTracker struct {
	mu          sync.RWMutex
	items       map[string]ActiveRequestSnapshot
	subscribers map[chan ActiveRequestEvent]struct{}
	maxItems    int
	ttl         time.Duration
}

func newActiveRequestTracker(maxItems int, ttl time.Duration) *activeRequestTracker {
	if maxItems <= 0 {
		maxItems = activeRequestMaxItems
	}
	if ttl <= 0 {
		ttl = activeRequestTTL
	}
	return &activeRequestTracker{
		items:       make(map[string]ActiveRequestSnapshot),
		subscribers: make(map[chan ActiveRequestEvent]struct{}),
		maxItems:    maxItems,
		ttl:         ttl,
	}
}

func ActiveRequestSnapshots() ActiveRequestList {
	return activeRequests.snapshot()
}

func ActiveRequestSubscribe() chan ActiveRequestEvent {
	return activeRequests.subscribe()
}

func ActiveRequestUnsubscribe(ch chan ActiveRequestEvent) {
	activeRequests.unsubscribe(ch)
}

func (t *activeRequestTracker) begin(snapshot ActiveRequestSnapshot) string {
	now := time.Now()
	nowMS := now.UnixMilli()
	id := strings.TrimSpace(snapshot.ID)
	if id == "" {
		id = fmt.Sprintf("active-%d-%d", now.UnixNano(), activeRequestSeq.Add(1))
	}
	if snapshot.StartedAt <= 0 {
		snapshot.StartedAt = nowMS
	}
	if snapshot.UpdatedAt <= 0 {
		snapshot.UpdatedAt = nowMS
	}
	if strings.TrimSpace(snapshot.Phase) == "" {
		snapshot.Phase = "routing"
	}
	snapshot.ID = id
	snapshot.RequestModel = strings.TrimSpace(snapshot.RequestModel)
	snapshot.RequestSource = strings.TrimSpace(snapshot.RequestSource)
	snapshot.ClientIP = strings.TrimSpace(snapshot.ClientIP)

	t.mu.Lock()
	defer t.mu.Unlock()

	t.pruneLocked(now)
	t.items[id] = snapshot
	t.trimLocked()
	t.publishLocked(activeRequestSnapshotEvent("started", snapshot, nowMS))
	return id
}

func (t *activeRequestTracker) update(id string, update func(*ActiveRequestSnapshot)) {
	id = strings.TrimSpace(id)
	if id == "" || update == nil {
		return
	}
	now := time.Now()
	nowMS := now.UnixMilli()

	t.mu.Lock()
	defer t.mu.Unlock()

	snapshot, ok := t.items[id]
	if !ok {
		return
	}
	update(&snapshot)
	snapshot.UpdatedAt = nowMS
	if strings.TrimSpace(snapshot.Phase) == "" {
		snapshot.Phase = "routing"
	}
	t.items[id] = snapshot
	t.publishLocked(activeRequestSnapshotEvent("updated", snapshot, nowMS))
}

func (t *activeRequestTracker) complete(id string) {
	id = strings.TrimSpace(id)
	if id == "" {
		return
	}
	nowMS := time.Now().UnixMilli()
	t.mu.Lock()
	snapshot, ok := t.items[id]
	if ok {
		delete(t.items, id)
		t.publishLocked(activeRequestSnapshotEvent("completed", snapshot, nowMS))
	}
	t.mu.Unlock()
}

func (t *activeRequestTracker) snapshot() ActiveRequestList {
	now := time.Now()
	nowMS := now.UnixMilli()

	t.mu.Lock()
	t.pruneLocked(now)
	items := make([]ActiveRequestSnapshot, 0, len(t.items))
	for _, item := range t.items {
		if item.StartedAt > 0 {
			item.ElapsedMS = nowMS - item.StartedAt
		}
		items = append(items, item)
	}
	t.mu.Unlock()

	sort.Slice(items, func(i, j int) bool {
		if items[i].ElapsedMS == items[j].ElapsedMS {
			return items[i].StartedAt < items[j].StartedAt
		}
		return items[i].ElapsedMS > items[j].ElapsedMS
	})

	return ActiveRequestList{
		Total:     len(items),
		UpdatedAt: nowMS,
		Items:     items,
	}
}

func (t *activeRequestTracker) subscribe() chan ActiveRequestEvent {
	ch := make(chan ActiveRequestEvent, activeRequestEventBuf)
	t.mu.Lock()
	t.subscribers[ch] = struct{}{}
	t.mu.Unlock()
	return ch
}

func (t *activeRequestTracker) unsubscribe(ch chan ActiveRequestEvent) {
	if ch == nil {
		return
	}
	t.mu.Lock()
	if _, ok := t.subscribers[ch]; ok {
		delete(t.subscribers, ch)
		close(ch)
	}
	t.mu.Unlock()
}

func (t *activeRequestTracker) publishLocked(event ActiveRequestEvent) {
	if len(t.subscribers) == 0 {
		return
	}
	for ch := range t.subscribers {
		select {
		case ch <- event:
		default:
		}
	}
}

func activeRequestSnapshotEvent(eventType string, snapshot ActiveRequestSnapshot, nowMS int64) ActiveRequestEvent {
	snapshot.UpdatedAt = nowMS
	if snapshot.StartedAt > 0 {
		snapshot.ElapsedMS = nowMS - snapshot.StartedAt
	}
	return ActiveRequestEvent{
		Type:      eventType,
		UpdatedAt: nowMS,
		Snapshot:  &snapshot,
	}
}

func (t *activeRequestTracker) pruneLocked(now time.Time) {
	if len(t.items) == 0 {
		return
	}
	cutoff := now.Add(-t.ttl).UnixMilli()
	for id, item := range t.items {
		if item.StartedAt <= 0 || item.StartedAt < cutoff {
			delete(t.items, id)
		}
	}
}

func (t *activeRequestTracker) trimLocked() {
	if len(t.items) <= t.maxItems {
		return
	}
	items := make([]ActiveRequestSnapshot, 0, len(t.items))
	for _, item := range t.items {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].StartedAt < items[j].StartedAt
	})
	for len(t.items) > t.maxItems && len(items) > 0 {
		delete(t.items, items[0].ID)
		items = items[1:]
	}
}

func (m *RelayMetrics) BeginActiveTracking(phase string) {
	if m == nil || m.activeRequestID != "" {
		return
	}
	m.activeRequestID = activeRequests.begin(ActiveRequestSnapshot{
		APIKeyID:       m.APIKeyID,
		GroupID:        m.GroupID,
		RequestModel:   m.RequestModel,
		RequestSource:  m.RequestSource,
		RequestStream:  m.RequestStream,
		ClientIP:       m.ClientIP,
		Phase:          phase,
		RequestPreview: m.activeRequestPayloadPreview(),
		FirstTokenSeen: !m.FirstTokenTime.IsZero(),
		UsedWS:         m.UsedWS,
	})
}

func (m *RelayMetrics) completeActiveTracking() {
	if m == nil {
		return
	}
	activeRequests.complete(m.activeRequestID)
	m.activeRequestID = ""
}

func (m *RelayMetrics) syncActiveBase() {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.APIKeyID = m.APIKeyID
		snapshot.GroupID = m.GroupID
		snapshot.RequestModel = m.RequestModel
		snapshot.RequestSource = m.RequestSource
		snapshot.RequestStream = m.RequestStream
		snapshot.ClientIP = m.ClientIP
		snapshot.RequestPreview = m.activeRequestPayloadPreview()
		snapshot.FirstTokenSeen = !m.FirstTokenTime.IsZero()
		snapshot.UsedWS = m.UsedWS
	})
}

func (m *RelayMetrics) syncActiveResponsePreview() {
	if m == nil {
		return
	}
	preview := m.activeResponsePayloadPreview()
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.ResponsePreview = preview
	})
}

func (m *RelayMetrics) activeRequestPayloadPreview() string {
	if m == nil {
		return ""
	}
	if len(m.RawRequest) > 0 {
		return activeDebugContentPreview(string(m.RawRequest))
	}
	if m.InternalRequest != nil {
		if data, err := json.Marshal(m.InternalRequest); err == nil {
			return activeDebugContentPreview(string(data))
		}
	}
	return ""
}

func (m *RelayMetrics) activeResponsePayloadPreview() string {
	if m == nil || m.InternalResponse == nil {
		return ""
	}
	filtered := m.filterResponseForLog(m.InternalResponse)
	if filtered == nil {
		return ""
	}
	data, err := json.Marshal(filtered)
	if err != nil {
		return ""
	}
	return activeDebugContentPreview(string(data))
}

func activeDebugContentPreview(content string) string {
	sanitized := strings.TrimSpace(op.SanitizeRelayLogContent(content))
	if sanitized == "" {
		return ""
	}
	runes := []rune(sanitized)
	if len(runes) <= activeRequestPreviewMaxRunes {
		return sanitized
	}
	return string(runes[:activeRequestPreviewMaxRunes]) + "...[truncated]"
}

func resetActiveCapacityMeta(snapshot *ActiveRequestSnapshot) {
	if snapshot == nil {
		return
	}
	snapshot.QuotaStatus = ""
	snapshot.QuotaReason = ""
	snapshot.CapacityStatus = ""
	snapshot.CapacityReason = ""
	snapshot.CapacityScope = ""
	snapshot.CapacitySource = ""
	snapshot.LastObservedAt = 0
	snapshot.ExpiresAt = 0
}

func applyActiveCapacityMeta(snapshot *ActiveRequestSnapshot, meta dbmodel.AttemptCapacityMeta) {
	if snapshot == nil {
		return
	}
	if value := strings.TrimSpace(meta.QuotaStatus); value != "" {
		snapshot.QuotaStatus = value
	}
	if value := strings.TrimSpace(meta.QuotaReason); value != "" {
		snapshot.QuotaReason = value
	}
	if value := strings.TrimSpace(meta.CapacityStatus); value != "" {
		snapshot.CapacityStatus = value
	}
	if value := strings.TrimSpace(meta.CapacityReason); value != "" {
		snapshot.CapacityReason = value
	}
	if value := strings.TrimSpace(meta.CapacityScope); value != "" {
		snapshot.CapacityScope = value
	}
	if value := strings.TrimSpace(meta.CapacitySource); value != "" {
		snapshot.CapacitySource = value
	}
	if meta.LastObservedAt > 0 {
		snapshot.LastObservedAt = meta.LastObservedAt
	}
	if meta.ExpiresAt > 0 {
		snapshot.ExpiresAt = meta.ExpiresAt
	}
}

func hasActiveCapacityMeta(meta dbmodel.AttemptCapacityMeta) bool {
	return strings.TrimSpace(meta.QuotaStatus) != "" ||
		strings.TrimSpace(meta.QuotaReason) != "" ||
		strings.TrimSpace(meta.CapacityStatus) != "" ||
		strings.TrimSpace(meta.CapacityReason) != "" ||
		strings.TrimSpace(meta.CapacityScope) != "" ||
		strings.TrimSpace(meta.CapacitySource) != "" ||
		meta.LastObservedAt > 0 ||
		meta.ExpiresAt > 0
}

func (m *RelayMetrics) markActiveFirstToken() {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.FirstTokenSeen = true
		snapshot.Phase = "streaming"
	})
}

func (m *RelayMetrics) MarkActiveUsedWS() {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.UsedWS = true
	})
}

func (m *RelayMetrics) markActiveAttemptStart(info activeAttemptInfo) {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.Phase = "attempting"
		snapshot.ChannelID = info.ChannelID
		snapshot.ChannelName = strings.TrimSpace(info.ChannelName)
		snapshot.ChannelKeyID = info.ChannelKeyID
		snapshot.ModelName = strings.TrimSpace(info.ModelName)
		snapshot.SiteID = info.SiteID
		snapshot.SiteAccountID = info.SiteAccountID
		resetActiveCapacityMeta(snapshot)
		applyActiveCapacityMeta(snapshot, info.AttemptMeta)
		snapshot.ChannelConcurrencyMode = ""
		snapshot.ChannelConcurrencyLimit = 0
		snapshot.ChannelConcurrencyWaitMS = 0
		snapshot.ChannelConcurrencyAcquired = false
		snapshot.ChannelConcurrencyTimedOut = false
		snapshot.AttemptsCount = info.AttemptCount
		snapshot.LastStatus = "attempting"
		snapshot.LastHTTPStatus = 0
		snapshot.LastFailureReason = ""
	})
}

func (m *RelayMetrics) markActiveAttemptQueueing(mode string, limit int) {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.Phase = "queueing"
		snapshot.ChannelConcurrencyMode = strings.TrimSpace(mode)
		snapshot.ChannelConcurrencyLimit = limit
		snapshot.ChannelConcurrencyWaitMS = 0
		snapshot.ChannelConcurrencyAcquired = false
		snapshot.ChannelConcurrencyTimedOut = false
	})
}

func (m *RelayMetrics) markActiveAttemptQueueResult(mode string, limit int, waited time.Duration, acquired bool, timedOut bool) {
	if m == nil {
		return
	}
	waitMS := 0
	if waited > 0 {
		waitMS = int(waited.Milliseconds())
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.ChannelConcurrencyMode = strings.TrimSpace(mode)
		snapshot.ChannelConcurrencyLimit = limit
		snapshot.ChannelConcurrencyWaitMS = waitMS
		snapshot.ChannelConcurrencyAcquired = acquired
		snapshot.ChannelConcurrencyTimedOut = timedOut
		if acquired {
			snapshot.Phase = "attempting"
		}
	})
}

func (m *RelayMetrics) markActiveAttemptEnd(status dbmodel.AttemptStatus, httpStatus int, failureReason string, written bool, attemptCount int) {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.LastStatus = string(status)
		snapshot.LastHTTPStatus = httpStatus
		snapshot.LastFailureReason = sanitizeTraceText(failureReason, "")
		snapshot.Written = written
		if attemptCount > 0 {
			snapshot.AttemptsCount = attemptCount
		}
		httpMeta := dbmodel.AttemptCapacityMetaFromHTTPStatus(httpStatus, time.Now().Unix())
		if hasActiveCapacityMeta(httpMeta) {
			resetActiveCapacityMeta(snapshot)
			applyActiveCapacityMeta(snapshot, httpMeta)
		}
		switch status {
		case dbmodel.AttemptSuccess:
			snapshot.Phase = "completed"
		case dbmodel.AttemptFailed:
			if written {
				snapshot.Phase = "streaming"
			} else {
				snapshot.Phase = "routing"
			}
		default:
			snapshot.Phase = "routing"
		}
	})
}

func (m *imagesRelayMetrics) BeginActiveTracking() {
	if m == nil || m.activeRequestID != "" {
		return
	}
	m.activeRequestID = activeRequests.begin(ActiveRequestSnapshot{
		APIKeyID:      m.APIKeyID,
		RequestModel:  m.RequestModel,
		RequestSource: m.RequestSource,
		ClientIP:      m.ClientIP,
		Phase:         "routing",
	})
}

func (m *imagesRelayMetrics) completeActiveTracking() {
	if m == nil {
		return
	}
	activeRequests.complete(m.activeRequestID)
	m.activeRequestID = ""
}

func (m *imagesRelayMetrics) markActiveFirstToken() {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.FirstTokenSeen = true
		snapshot.Written = true
		snapshot.Phase = "streaming"
	})
}

func (m *imagesRelayMetrics) markActiveAttemptStart(info activeAttemptInfo) {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.Phase = "attempting"
		snapshot.ChannelID = info.ChannelID
		snapshot.ChannelName = strings.TrimSpace(info.ChannelName)
		snapshot.ChannelKeyID = info.ChannelKeyID
		snapshot.ModelName = strings.TrimSpace(info.ModelName)
		snapshot.SiteID = info.SiteID
		snapshot.SiteAccountID = info.SiteAccountID
		resetActiveCapacityMeta(snapshot)
		applyActiveCapacityMeta(snapshot, info.AttemptMeta)
		snapshot.ChannelConcurrencyMode = ""
		snapshot.ChannelConcurrencyLimit = 0
		snapshot.ChannelConcurrencyWaitMS = 0
		snapshot.ChannelConcurrencyAcquired = false
		snapshot.ChannelConcurrencyTimedOut = false
		snapshot.AttemptsCount = info.AttemptCount
		snapshot.LastStatus = "attempting"
		snapshot.LastHTTPStatus = 0
		snapshot.LastFailureReason = ""
	})
}

func (m *imagesRelayMetrics) markActiveAttemptQueueing(mode string, limit int) {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.Phase = "queueing"
		snapshot.ChannelConcurrencyMode = strings.TrimSpace(mode)
		snapshot.ChannelConcurrencyLimit = limit
		snapshot.ChannelConcurrencyWaitMS = 0
		snapshot.ChannelConcurrencyAcquired = false
		snapshot.ChannelConcurrencyTimedOut = false
	})
}

func (m *imagesRelayMetrics) markActiveAttemptQueueResult(mode string, limit int, waited time.Duration, acquired bool, timedOut bool) {
	if m == nil {
		return
	}
	waitMS := 0
	if waited > 0 {
		waitMS = int(waited.Milliseconds())
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.ChannelConcurrencyMode = strings.TrimSpace(mode)
		snapshot.ChannelConcurrencyLimit = limit
		snapshot.ChannelConcurrencyWaitMS = waitMS
		snapshot.ChannelConcurrencyAcquired = acquired
		snapshot.ChannelConcurrencyTimedOut = timedOut
		if acquired {
			snapshot.Phase = "attempting"
		}
	})
}

func (m *imagesRelayMetrics) markActiveAttemptEnd(status dbmodel.AttemptStatus, httpStatus int, failureReason string, written bool, attemptCount int) {
	if m == nil {
		return
	}
	activeRequests.update(m.activeRequestID, func(snapshot *ActiveRequestSnapshot) {
		snapshot.LastStatus = string(status)
		snapshot.LastHTTPStatus = httpStatus
		snapshot.LastFailureReason = sanitizeTraceText(failureReason, "")
		snapshot.Written = written
		if attemptCount > 0 {
			snapshot.AttemptsCount = attemptCount
		}
		httpMeta := dbmodel.AttemptCapacityMetaFromHTTPStatus(httpStatus, time.Now().Unix())
		if hasActiveCapacityMeta(httpMeta) {
			resetActiveCapacityMeta(snapshot)
			applyActiveCapacityMeta(snapshot, httpMeta)
		}
		if status == dbmodel.AttemptSuccess {
			snapshot.Phase = "completed"
		} else if written {
			snapshot.Phase = "streaming"
		} else {
			snapshot.Phase = "routing"
		}
	})
}
