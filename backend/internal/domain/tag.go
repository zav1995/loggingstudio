package domain

import "time"

// TagGroup visually clusters related tags (e.g., "Shot type", "Score state").
type TagGroup struct {
	ID           string    `json:"id,omitempty"`
	Name         string    `json:"name"          validate:"required,min=1,max=64"`
	Color        string    `json:"color"         validate:"required,hexcolor"`
	DisplayOrder int       `json:"display_order"`
	CreatedAt    time.Time `json:"created_at,omitempty"`
}

func (g *TagGroup) Validate() error { return V.Struct(g) }

// Tag is a labelled marker that can be attached to a Log.
// Hotkey is nullable: nil means no hotkey assigned.
type Tag struct {
	ID           string    `json:"id,omitempty"`
	GroupID      string    `json:"group_id"      validate:"required,uuid"`
	Name         string    `json:"name"          validate:"required,min=1,max=64"`
	Hotkey       *string   `json:"hotkey,omitempty" validate:"omitempty,min=1,max=16"`
	DisplayOrder int       `json:"display_order"`
	CreatedAt    time.Time `json:"created_at,omitempty"`
}

func (t *Tag) Validate() error { return V.Struct(t) }
