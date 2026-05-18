package balancer

import (
	"context"
	"testing"
	"time"
)

func enableChannelConcurrencyForTest(t *testing.T, maxInFlight int, queueTimeout time.Duration) {
	t.Helper()
	channelConcurrencyConfigOverride = &ChannelConcurrencyConfig{
		Enabled:      true,
		MaxInFlight:  maxInFlight,
		QueueTimeout: queueTimeout,
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
