// Package events ships an in-process fan-out broker for Server-Sent Events.
//
// MVP scale: a single backend process; no Redis, no cross-process delivery.
// Subscribers register a buffered channel; publishers fire-and-forget. If a
// subscriber falls behind, its event is dropped rather than blocking the
// publisher — better one client missing an update than the whole stream
// stalling.
package events

import "sync"

const subscriberBuffer = 64

// Event is what gets serialized to the SSE stream.
type Event struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

// Broker fans out events from any goroutine to any number of subscribers.
// The zero value is not usable; construct with New.
type Broker struct {
	mu          sync.RWMutex
	subscribers map[chan Event]struct{}
}

func New() *Broker {
	return &Broker{subscribers: make(map[chan Event]struct{})}
}

// Subscribe returns a receive channel and an unsubscribe func. The unsub
// function is safe to call exactly once; double-calling panics like any other
// double-close.
func (b *Broker) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, subscriberBuffer)
	b.mu.Lock()
	b.subscribers[ch] = struct{}{}
	b.mu.Unlock()
	return ch, func() {
		b.mu.Lock()
		delete(b.subscribers, ch)
		b.mu.Unlock()
		close(ch)
	}
}

// Publish delivers evt to every current subscriber, dropping the event for
// any subscriber whose buffer is full.
func (b *Broker) Publish(evt Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.subscribers {
		select {
		case ch <- evt:
		default:
		}
	}
}
