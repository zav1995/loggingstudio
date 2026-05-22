package events

import (
	"testing"
	"time"
)

func TestBrokerFanOut(t *testing.T) {
	b := New()
	a, unsubA := b.Subscribe()
	c, unsubC := b.Subscribe()
	defer unsubA()
	defer unsubC()

	b.Publish(Event{Type: "log.created", Payload: 1})

	for _, ch := range []<-chan Event{a, c} {
		select {
		case evt := <-ch:
			if evt.Type != "log.created" {
				t.Fatalf("type = %q, want log.created", evt.Type)
			}
		case <-time.After(time.Second):
			t.Fatal("subscriber did not receive event within 1s")
		}
	}
}

func TestBrokerUnsubscribeStopsDelivery(t *testing.T) {
	b := New()
	a, unsubA := b.Subscribe()
	unsubA()

	b.Publish(Event{Type: "log.deleted"})

	// channel is closed after unsubscribe; receive returns zero immediately
	if _, ok := <-a; ok {
		t.Fatal("expected channel to be closed after unsubscribe")
	}
}

func TestBrokerDropsSlowSubscriber(t *testing.T) {
	b := New()
	_, unsub := b.Subscribe()
	defer unsub()

	// Flood beyond the buffer; the publisher must not block. We don't drain.
	done := make(chan struct{})
	go func() {
		for i := 0; i < subscriberBuffer*4; i++ {
			b.Publish(Event{Type: "log.created", Payload: i})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Publish blocked on a slow subscriber")
	}
}
