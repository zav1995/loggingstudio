package domain

import "time"

// Session is a logging context grouping logs by the operator's working shift,
// e.g. "RG26 D3 Court 13 morning shift".
type Session struct {
	ID        string     `json:"id,omitempty"`
	MediaID   string     `json:"media_id" validate:"required,max=128"`
	Name      string     `json:"name"     validate:"required,min=1,max=128"`
	StartedAt time.Time  `json:"started_at,omitempty"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
	Notes     string     `json:"notes,omitempty"`
}

func (s *Session) Validate() error { return V.Struct(s) }
