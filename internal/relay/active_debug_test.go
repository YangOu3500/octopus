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
	metrics := NewRelayMetrics(7, "client-model", []byte(`{"model":"client-model","messages":[]}`), &transformerModel.InternalLLMRequest{
		Model:  "client-model",
		Stream: &stream,
	})
	metrics.SetGroupID(11)
	metrics.SetClientInfo("127.0.0.1", "relay")
	metrics.BeginActiveTracking("routing")
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

	metrics.completeActiveTracking()
	list = ActiveRequestSnapshots()
	if list.Total != 0 {
		t.Fatalf("active total after complete = %d, want 0", list.Total)
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
