// Package picker ships the in-process relay used by the cross-device tag
// picker. The studio publishes "state" messages to a session id; other
// devices on the LAN subscribe to that session via SSE and post action
// messages back through the same relay. No persistence, no auth — the
// session id is the shared secret.
package picker

import (
	"sync"

	"github.com/zav1995/loggingstudio/backend/internal/events"
)

// Relay maps session ids to in-process brokers. Brokers are created lazily on
// first Get and held forever — the lifetime of a session is bounded by the
// backend process, which is fine for the local-first MVP.
type Relay struct {
	mu      sync.Mutex
	brokers map[string]*events.Broker
}

func NewRelay() *Relay {
	return &Relay{brokers: make(map[string]*events.Broker)}
}

// Get returns the broker for sessionID, creating it on first call.
func (r *Relay) Get(sessionID string) *events.Broker {
	r.mu.Lock()
	defer r.mu.Unlock()
	b, ok := r.brokers[sessionID]
	if !ok {
		b = events.New()
		r.brokers[sessionID] = b
	}
	return b
}
