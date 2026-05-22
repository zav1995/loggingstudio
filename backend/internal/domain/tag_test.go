package domain

import "testing"

func ptr[T any](v T) *T { return &v }

func TestTagGroupValidate(t *testing.T) {
	cases := []struct {
		name    string
		g       TagGroup
		wantErr bool
	}{
		{name: "valid", g: TagGroup{Name: "Shot type", Color: "#00FF87"}},
		{name: "missing name", g: TagGroup{Color: "#00FF87"}, wantErr: true},
		{name: "bad color", g: TagGroup{Name: "Shot type", Color: "green"}, wantErr: true},
		{name: "color missing hash", g: TagGroup{Name: "Shot type", Color: "00FF87"}, wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.g.Validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("Validate() err = %v, wantErr = %v", err, tc.wantErr)
			}
		})
	}
}

func TestTagValidate(t *testing.T) {
	cases := []struct {
		name    string
		tag     Tag
		wantErr bool
	}{
		{
			name: "valid with hotkey",
			tag:  Tag{GroupID: "11111111-1111-1111-1111-111111111111", Name: "Forehand", Hotkey: ptr("f")},
		},
		{
			name: "valid without hotkey",
			tag:  Tag{GroupID: "11111111-1111-1111-1111-111111111111", Name: "Forehand"},
		},
		{
			name:    "missing group id",
			tag:     Tag{Name: "Forehand"},
			wantErr: true,
		},
		{
			name:    "non-uuid group id",
			tag:     Tag{GroupID: "not-a-uuid", Name: "Forehand"},
			wantErr: true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.tag.Validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("Validate() err = %v, wantErr = %v", err, tc.wantErr)
			}
		})
	}
}
