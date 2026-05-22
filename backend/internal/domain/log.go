package domain

import (
	"errors"
	"time"
)

// Log is a timecoded marker against a Media.
// OffsetIn / OffsetOut are milliseconds from media start.
// OffsetOut is nullable for point-in-time logs.
type Log struct {
	ID        string    `json:"id,omitempty"`
	MediaID   string    `json:"media_id"   validate:"required,max=128"`
	OffsetIn  int64     `json:"offset_in"  validate:"gte=0"`
	OffsetOut *int64    `json:"offset_out,omitempty"`
	Tags      []string  `json:"tags"       validate:"dive,uuid"`
	Source    string    `json:"source"     validate:"required,min=1,max=128"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// ErrLogOffsetOutBeforeIn is returned when offset_out < offset_in.
var ErrLogOffsetOutBeforeIn = errors.New("offset_out must be >= offset_in")

func (l *Log) Validate() error {
	if err := V.Struct(l); err != nil {
		return err
	}
	if l.OffsetOut != nil && *l.OffsetOut < l.OffsetIn {
		return ErrLogOffsetOutBeforeIn
	}
	return nil
}
