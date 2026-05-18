package relay

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	dbmodel "github.com/bestruirui/octopus/internal/model"
)

const (
	activeRequestMaxItems = 512
	activeRequestTTL      = 2 * time.Hour
	activeRequestEventBuf = 64
)

var (
	activeRequests   = newActiveRequestTracker(activeRequestMaxItems, activeRequestTTL)
	activeRequestSeq atomic.Uint64
)

type ActiveRequestSnapshot struct {
	ID                string `json:"id"`
	APIKeyID          int    `json:"api_key_id,omitempty"`
	GroupID           int    `json:"group_id,omitempty"`
	RequestModel      string `json:"request_model"`
	RequestSource     string `json:"request_source,omitempty"`
	RequestStream     bool   `json:"request_stream"`
	ClientIP          string `json:"client_ip,omitempty"`
	StartedAt         int64  `json:"started_at"`
	UpdatedAt         int64  `json:"updated_at"`
	ElapsedMS         int64  `json:"elapsed_ms"`
	Phase             string `json:"phase"`
	ChannelID         int    `json:"channel_id,omitempty"`
	ChannelName       string `json:"channel_name,omitempty"`
	ChannelKeyID      int    `json:"channel_key_id,omitempty"`
	ModelName         string `json:"model_name,omitempty"`
	SiteID            int    `json:"site_id,omitempty"`
	SiteAccountID     int    `json:"site_account_id,omitempty"`
	AttemptsCount     int    `json:"attempts_count,omitempty"`
	LastStatus        string `json:"last_status,omitempty"`
	LastHTTPStatus    int    `json:"last_http_status,omitempty"`
	LastFailureReason string `json:"last_failure_reason,omitempty"`
	Written           bool   `json:"written"`
	FirstTokenSeen    bool   `json:"first_token_seen"`
	UsedWS            bool   `json:"used_ws"`
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
		snapshot.FirstTokenSeen = !m.FirstTokenTime.IsZero()
		snapshot.UsedWS = m.UsedWS
	})
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
		snapshot.AttemptsCount = info.AttemptCount
		snapshot.LastStatus = "attempting"
		snapshot.LastHTTPStatus = 0
		snapshot.LastFailureReason = ""
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
		snapshot.AttemptsCount = info.AttemptCount
		snapshot.LastStatus = "attempting"
		snapshot.LastHTTPStatus = 0
		snapshot.LastFailureReason = ""
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
		if status == dbmodel.AttemptSuccess {
			snapshot.Phase = "completed"
		} else if written {
			snapshot.Phase = "streaming"
		} else {
			snapshot.Phase = "routing"
		}
	})
}
