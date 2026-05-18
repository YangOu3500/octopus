package model

import (
	"testing"
	"time"
)

func TestGetChannelKeyPrefersPreferredKeyID(t *testing.T) {
	channel := &Channel{
		Keys: []ChannelKey{
			{ID: 1, Enabled: true, ChannelKey: "first", TotalCost: 1},
			{ID: 2, Enabled: true, ChannelKey: "preferred", TotalCost: 100},
		},
	}

	selected := channel.GetChannelKey(ChannelKeySelectOptions{PreferredKeyID: 2})
	if selected.ID != 2 {
		t.Fatalf("expected preferred key 2, got %d", selected.ID)
	}
}

func TestGetChannelKeyUsesPreferredKeyAfterRecent429(t *testing.T) {
	channel := &Channel{
		Keys: []ChannelKey{
			{ID: 1, Enabled: true, ChannelKey: "fallback", TotalCost: 1},
			{ID: 2, Enabled: true, ChannelKey: "preferred", TotalCost: 100, StatusCode: 429, LastUseTimeStamp: time.Now().Unix()},
		},
	}

	selected := channel.GetChannelKey(ChannelKeySelectOptions{PreferredKeyID: 2})
	if selected.ID != 2 {
		t.Fatalf("expected preferred key 2 despite recent 429, got %d", selected.ID)
	}
}

func TestGetChannelKeyUsesLowestCostKeyAfterRecent429(t *testing.T) {
	channel := &Channel{
		Keys: []ChannelKey{
			{ID: 1, Enabled: true, ChannelKey: "recent-429", TotalCost: 1, StatusCode: 429, LastUseTimeStamp: time.Now().Unix()},
			{ID: 2, Enabled: true, ChannelKey: "other", TotalCost: 100},
		},
	}

	selected := channel.GetChannelKey()
	if selected.ID != 1 {
		t.Fatalf("expected lowest cost key 1 despite recent 429, got %d", selected.ID)
	}
}

func TestSelectChannelKeySkipsKnownHardBlockedStatusWhenEnabled(t *testing.T) {
	channel := &Channel{
		Keys: []ChannelKey{
			{ID: 1, Enabled: true, ChannelKey: "quota-blocked", TotalCost: 1, StatusCode: 402, LastUseTimeStamp: time.Now().Unix()},
			{ID: 2, Enabled: true, ChannelKey: "fallback", TotalCost: 10},
		},
	}

	selected := channel.SelectChannelKey(ChannelKeySelectOptions{SkipUnavailableStatuses: true})
	if selected.Key.ID != 2 {
		t.Fatalf("expected fallback key 2 after skipping known blocked key, got %+v", selected)
	}
	if selected.SkippedUnavailableKeys != 1 {
		t.Fatalf("expected one skipped unavailable key, got %+v", selected)
	}
	if HasAttemptCapacityMeta(selected.BlockedMeta) {
		t.Fatalf("did not expect blocked meta when a fallback key is selected, got %+v", selected)
	}
}

func TestSelectChannelKeyReturnsBlockedMetaWhenAllKeysHardBlocked(t *testing.T) {
	channel := &Channel{
		Keys: []ChannelKey{
			{ID: 1, Enabled: true, ChannelKey: "quota-blocked", TotalCost: 1, StatusCode: 402, LastUseTimeStamp: time.Now().Unix()},
			{ID: 2, Enabled: true, ChannelKey: "auth-blocked", TotalCost: 2, StatusCode: 401, LastUseTimeStamp: time.Now().Unix()},
		},
	}

	selected := channel.SelectChannelKey(ChannelKeySelectOptions{SkipUnavailableStatuses: true})
	if selected.Key.ID != 0 {
		t.Fatalf("expected no selectable key, got %+v", selected)
	}
	if selected.SkippedUnavailableKeys != 2 {
		t.Fatalf("expected both blocked keys to be skipped, got %+v", selected)
	}
	if selected.BlockedMeta.QuotaStatus != "quota_error" ||
		selected.BlockedMeta.CapacityStatus != "blocked" ||
		selected.BlockedMeta.CapacityReason != "http_402" {
		t.Fatalf("unexpected blocked meta: %+v", selected)
	}
}
