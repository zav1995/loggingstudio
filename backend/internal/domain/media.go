package domain

import "time"

// Media is a single piece of source video the studio is logging against.
// Media.ID is externally supplied (typically a ScorePlay asset id), not a UUID.
type Media struct {
	ID          string    `json:"id"            validate:"required,max=128"`
	HLSURL      string    `json:"hls_url"       validate:"required,url"`
	StartedAtTC string    `json:"started_at_tc" validate:"required,timecode"`
	FrameRate   int       `json:"frame_rate"    validate:"required,min=1,max=120"`
	Label       string    `json:"label,omitempty"`
	CreatedAt   time.Time `json:"created_at,omitempty"`
}

func (m *Media) Validate() error { return V.Struct(m) }
