package domain

import (
	"encoding/json"
	"time"
)

// IngestParser is a saved transformation from a foreign sidecar payload
// (XML or JSON) into Log records. Mapping and Filter are JSON validated
// against shared/parser-schema.json at the handler boundary, not here.
type IngestParser struct {
	ID            string          `json:"id,omitempty"`
	Name          string          `json:"name"           validate:"required,min=1,max=128"`
	SourceFormat  string          `json:"source_format"  validate:"required,oneof=xml json"`
	SamplePayload string          `json:"sample_payload" validate:"required"`
	Mapping       json.RawMessage `json:"mapping"        validate:"required"`
	Filter        json.RawMessage `json:"filter,omitempty"`
	CreatedAt     time.Time       `json:"created_at,omitempty"`
	UpdatedAt     time.Time       `json:"updated_at,omitempty"`
}

func (p *IngestParser) Validate() error { return V.Struct(p) }
