package balancer

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	dbpkg "github.com/bestruirui/octopus/internal/db"
	"github.com/bestruirui/octopus/internal/model"
	"github.com/bestruirui/octopus/internal/op"
)

func enableChannelConcurrencyForTest(t *testing.T, maxInFlight int, queueTimeout time.Duration) {
	enableChannelConcurrencyForTestWithMode(t, ChannelConcurrencyModeLocal, maxInFlight, queueTimeout, time.Minute)
}

func enableChannelConcurrencyForTestWithMode(t *testing.T, mode string, maxInFlight int, queueTimeout time.Duration, leaseTTL time.Duration) {
	t.Helper()
	channelConcurrencyConfigOverride = &ChannelConcurrencyConfig{
		Enabled:      true,
		Mode:         mode,
		MaxInFlight:  maxInFlight,
		QueueTimeout: queueTimeout,
		LeaseTTL:     leaseTTL,
	}
	t.Cleanup(Reset)
}

func TestChannelConcurrencyDisabledAllowsAcquire(t *testing.T) {
	Reset()
	t.Cleanup(Reset)

	release1, _, ok := AcquireChannelConcurrency(context.Background(), 1, "gpt-test")
	if !ok {
		t.Fatal("first acquire should succeed when disabled")
	}
	defer release1()
	release2, _, ok := AcquireChannelConcurrency(context.Background(), 1, "gpt-test")
	if !ok {
		t.Fatal("second acquire should succeed when disabled")
	}
	defer release2()
	if got := ActiveChannelConcurrencyCount(1, "gpt-test"); got != 0 {
		t.Fatalf("active hard concurrency count = %d, want 0 when disabled", got)
	}
}

func TestChannelConcurrencyTimeoutAndRelease(t *testing.T) {
	Reset()
	enableChannelConcurrencyForTest(t, 1, 20*time.Millisecond)

	release, _, ok := AcquireChannelConcurrency(context.Background(), 1, "gpt-test")
	if !ok {
		t.Fatal("first acquire should succeed")
	}
	if got := ActiveChannelConcurrencyCount(1, "gpt-test"); got != 1 {
		t.Fatalf("active count = %d, want 1", got)
	}

	_, waited, ok := AcquireChannelConcurrency(context.Background(), 1, "gpt-test")
	if ok {
		t.Fatal("second acquire should time out while slot is held")
	}
	if waited < 20*time.Millisecond {
		t.Fatalf("waited = %v, want at least queue timeout", waited)
	}

	release()
	if got := ActiveChannelConcurrencyCount(1, "gpt-test"); got != 0 {
		t.Fatalf("active count after release = %d, want 0", got)
	}

	release2, _, ok := AcquireChannelConcurrency(context.Background(), 1, "gpt-test")
	if !ok {
		t.Fatal("acquire should succeed after release")
	}
	release2()
}

func TestChannelConcurrencyWaitsForRelease(t *testing.T) {
	Reset()
	enableChannelConcurrencyForTest(t, 1, 200*time.Millisecond)

	release, _, ok := AcquireChannelConcurrency(context.Background(), 1, "gpt-test")
	if !ok {
		t.Fatal("first acquire should succeed")
	}
	done := make(chan bool, 1)
	go func() {
		release2, _, ok := AcquireChannelConcurrency(context.Background(), 1, "gpt-test")
		if ok {
			release2()
		}
		done <- ok
	}()

	time.Sleep(30 * time.Millisecond)
	release()

	select {
	case ok := <-done:
		if !ok {
			t.Fatal("waiting acquire should succeed after release")
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("waiting acquire did not complete")
	}
}

func TestChannelConcurrencyContextCancellation(t *testing.T) {
	Reset()
	enableChannelConcurrencyForTest(t, 1, time.Second)

	release, _, ok := AcquireChannelConcurrency(context.Background(), 1, "gpt-test")
	if !ok {
		t.Fatal("first acquire should succeed")
	}
	defer release()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, ok = AcquireChannelConcurrency(ctx, 1, "gpt-test")
	if ok {
		t.Fatal("acquire should fail after context cancellation")
	}
}

func TestDatabaseChannelConcurrencyTimeoutAndRelease(t *testing.T) {
	Reset()
	dbPath := filepath.Join(t.TempDir(), "channel-concurrency.db")
	if err := dbpkg.InitDB("sqlite", dbPath, false); err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	if err := op.InitCache(); err != nil {
		t.Fatalf("InitCache failed: %v", err)
	}
	t.Cleanup(func() {
		_ = dbpkg.Close()
	})
	enableChannelConcurrencyForTestWithMode(t, ChannelConcurrencyModeDatabase, 1, 20*time.Millisecond, time.Minute)

	release, _, ok := AcquireChannelConcurrency(context.Background(), 10, "db-model")
	if !ok {
		t.Fatal("first database acquire should succeed")
	}
	if got := ActiveChannelConcurrencyCount(10, "db-model"); got != 1 {
		t.Fatalf("active database count = %d, want 1", got)
	}

	_, waited, ok := AcquireChannelConcurrency(context.Background(), 10, "db-model")
	if ok {
		t.Fatal("second database acquire should time out while slot is leased")
	}
	if waited < 20*time.Millisecond {
		t.Fatalf("waited = %v, want at least queue timeout", waited)
	}

	release()
	if got := ActiveChannelConcurrencyCount(10, "db-model"); got != 0 {
		t.Fatalf("active database count after release = %d, want 0", got)
	}

	release2, _, ok := AcquireChannelConcurrency(context.Background(), 10, "db-model")
	if !ok {
		t.Fatal("database acquire should succeed after release")
	}
	release2()
}

func TestDatabaseChannelConcurrencyCleansExpiredLeases(t *testing.T) {
	Reset()
	dbPath := filepath.Join(t.TempDir(), "channel-concurrency-expired.db")
	if err := dbpkg.InitDB("sqlite", dbPath, false); err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	if err := op.InitCache(); err != nil {
		t.Fatalf("InitCache failed: %v", err)
	}
	t.Cleanup(func() {
		_ = dbpkg.Close()
	})
	enableChannelConcurrencyForTestWithMode(t, ChannelConcurrencyModeDatabase, 1, 20*time.Millisecond, time.Minute)

	expired := model.ChannelConcurrencyLease{
		ChannelID:  11,
		ModelName:  "expired-model",
		Slot:       1,
		LeaseToken: "expired-lease",
		AcquiredAt: time.Now().Add(-time.Minute).UnixMilli(),
		ExpiresAt:  time.Now().Add(-time.Second).UnixMilli(),
	}
	if err := dbpkg.GetDB().Create(&expired).Error; err != nil {
		t.Fatalf("seed expired lease failed: %v", err)
	}

	release, _, ok := AcquireChannelConcurrency(context.Background(), 11, "expired-model")
	if !ok {
		t.Fatal("database acquire should clean expired lease and succeed")
	}
	defer release()
	if got := ActiveChannelConcurrencyCount(11, "expired-model"); got != 1 {
		t.Fatalf("active database count = %d, want 1", got)
	}
}
