package domain

import "testing"

func TestSessionValidate(t *testing.T) {
	cases := []struct {
		name    string
		s       Session
		wantErr bool
	}{
		{name: "valid", s: Session{MediaID: "asset-123", Name: "Court 13 morning"}},
		{name: "missing media id", s: Session{Name: "Court 13 morning"}, wantErr: true},
		{name: "missing name", s: Session{MediaID: "asset-123"}, wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.s.Validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("Validate() err = %v, wantErr = %v", err, tc.wantErr)
			}
		})
	}
}
