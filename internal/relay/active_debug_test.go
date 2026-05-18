package relay

import (
	"strings"
	"testing"
	"time"

	dbmodel "github.com/bestruirui/octopus/internal/model"
	transformerModel "github.com/bestruirui/octopus/internal/transformer/model"
)

func TestActiveRequestTrackerLifecycleAndSanitization(t *testing.T) {
	previous := activeRequests
	activeRequests = newActiveRequestTracker(16, time.Hour)
	defer func() {
		activeRequests = previous
	}()

	stream := true
	metrics := NewRelayMetrics(7, "client-model", []byte(`{"model":"client-model","authorization":"Bearer abc.def","api_key":"sk-live-secret","messages":[]}`), &transformerModel.InternalLLMRequest{
		Model:  "client-model",
		Stream: &stream,
	})
	metrics.SetGroupID(11)
	metrics.SetClientInfo("127.0.0.1", "relay")
	ch := ActiveRequestSubscribe()
	defer ActiveRequestUnsubscribe(ch)
	metrics.BeginActiveTracking("routing")
	event := readActiveRequestEvent(t, ch)
	if event.Type != "started" || event.Snapshot == nil || event.Snapshot.RequestModel != "client-model" {
		t.Fatalf("unexpected started event: %+v", event)
	}
	metrics.markActiveAttemptStart(activeAttemptInfo{
		ChannelID:     23,
		ChannelName:   "debug-channel",
		ChannelKeyID:  31,
		ModelName:     "upstream-model",
		SiteID:        41,
		SiteAccountID: 59,
		AttemptCount:  1,
	})
	metrics.SetFirstTokenTime(time.Now())
	metrics.markActiveAttemptEnd(dbmodel.AttemptFailed, 429, "Authorization header present", true, 1)

	list := ActiveRequestSnapshots()
	if list.Total != 1 {
		t.Fatalf("active total = %d, want 1", list.Total)
	}
	got := list.Items[0]
	if got.RequestModel != "client-model" || got.ModelName != "upstream-model" {
		t.Fatalf("unexpected model fields: %+v", got)
	}
	if got.APIKeyID != 7 || got.GroupID != 11 || got.ChannelID != 23 || got.ChannelKeyID != 31 {
		t.Fatalf("unexpected routing fields: %+v", got)
	}
	if !got.RequestStream || !got.FirstTokenSeen || !got.Written {
		t.Fatalf("expected stream/first-token/written flags: %+v", got)
	}
	if got.LastFailureReason == "" || strings.Contains(strings.ToLower(got.LastFailureReason), "authorization") {
		t.Fatalf("failure reason was not sanitized: %q", got.LastFailureReason)
	}
	if got.RequestPreview == "" || strings.Contains(got.RequestPreview, "sk-live-secret") || strings.Contains(got.RequestPreview, "abc.def") {
		t.Fatalf("request preview was not sanitized: %q", got.RequestPreview)
	}

	metrics.SetInternalResponse(&transformerModel.InternalLLMResponse{
		Choices: []transformerModel.Choice{{
			Message: &transformerModel.Message{
				Content: transformerModel.MessageContent{Content: activeDebugStringPtr("ok sk-live-secret Authorization: Bearer abc.def")},
			},
		}},
	}, "actual-model")
	list = ActiveRequestSnapshots()
	if list.Total != 1 {
		t.Fatalf("active total after response preview = %d, want 1", list.Total)
	}
	got = list.Items[0]
	if got.ResponsePreview == "" || strings.Contains(got.ResponsePreview, "sk-live-secret") || strings.Contains(got.ResponsePreview, "abc.def") {
		t.Fatalf("response preview was not sanitized: %q", got.ResponsePreview)
	}

	metrics.completeActiveTracking()
	list = ActiveRequestSnapshots()
	if list.Total != 0 {
		t.Fatalf("active total after complete = %d, want 0", list.Total)
	}
}

func TestActiveRequestTrackerEventStream(t *testing.T) {
	previous := activeRequests
	activeRequests = newActiveRequestTracker(16, time.Hour)
	defer func() {
		activeRequests = previous
	}()

	ch := ActiveRequestSubscribe()
	defer ActiveRequestUnsubscribe(ch)

	metrics := NewRelayMetrics(7, "client-model", []byte(`{"model":"client-model","messages":[]}`), &transformerModel.InternalLLMRequest{
		Model: "client-model",
	})
	metrics.SetClientInfo("127.0.0.1", "relay")
	metrics.BeginActiveTracking("routing")
	started := readActiveRequestEvent(t, ch)
	if started.Type != "started" || started.Snapshot == nil || started.Snapshot.ID == "" {
		t.Fatalf("unexpected started event: %+v", started)
	}

	metrics.markActiveAttemptStart(activeAttemptInfo{ChannelID: 23, ChannelName: "debug-channel", AttemptCount: 1})
	updated := readActiveRequestEvent(t, ch)
	if updated.Type != "updated" || updated.Snapshot == nil || updated.Snapshot.ChannelID != 23 {
		t.Fatalf("unexpected updated event: %+v", updated)
	}

	metrics.completeActiveTracking()
	completed := readActiveRequestEvent(t, ch)
	if completed.Type != "completed" || completed.Snapshot == nil || completed.Snapshot.ID != started.Snapshot.ID {
		t.Fatalf("unexpected completed event: %+v", completed)
	}
}

func TestActiveRequestTrackerPrunesOldAndBoundsItems(t *testing.T) {
	tracker := newActiveRequestTracker(2, time.Minute)
	now := time.Now()

	tracker.begin(ActiveRequestSnapshot{ID: "old", RequestModel: "old-model", StartedAt: now.Add(-2 * time.Minute).UnixMilli()})
	tracker.begin(ActiveRequestSnapshot{ID: "first", RequestModel: "first-model", StartedAt: now.Add(-3 * time.Second).UnixMilli()})
	tracker.begin(ActiveRequestSnapshot{ID: "second", RequestModel: "second-model", StartedAt: now.Add(-2 * time.Second).UnixMilli()})
	tracker.begin(ActiveRequestSnapshot{ID: "third", RequestModel: "third-model", StartedAt: now.Add(-1 * time.Second).UnixMilli()})

	list := tracker.snapshot()
	if list.Total != 2 {
		t.Fatalf("bounded active total = %d, want 2", list.Total)
	}
	for _, item := range list.Items {
		if item.ID == "old" || item.ID == "first" {
			t.Fatalf("expected old entries to be pruned, got %+v", list.Items)
		}
	}
}

func readActiveRequestEvent(t *testing.T, ch chan ActiveRequestEvent) ActiveRequestEvent {
	t.Helper()
	select {
	case event := <-ch:
		return event
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for active request event")
	}
	return ActiveRequestEvent{}
}

func activeDebugStringPtr(value string) *string {
	return &value
}
