package domain

import (
	"errors"
	"testing"
)

func TestLogValidate(t *testing.T) {
	cases := []struct {
		name    string
		log     Log
		wantErr bool
		errIs   error
	}{
		{
			name: "valid point-in-time log",
			log: Log{
				MediaID:  "asset-123",
				OffsetIn: 1000,
				Tags:     []string{"11111111-1111-1111-1111-111111111111"},
				Source:   "manual",
			},
		},
		{
			name: "valid range log",
			log: Log{
				MediaID:   "asset-123",
				OffsetIn:  1000,
				OffsetOut: ptr[int64](2000),
				Tags:      []string{},
				Source:    "ingest:rg_xml",
			},
		},
		{
			name:    "negative offset_in",
			log:     Log{MediaID: "asset-123", OffsetIn: -1, Source: "manual"},
			wantErr: true,
		},
		{
			name:    "offset_out before offset_in",
			log:     Log{MediaID: "asset-123", OffsetIn: 2000, OffsetOut: ptr[int64](1000), Source: "manual"},
			wantErr: true,
			errIs:   ErrLogOffsetOutBeforeIn,
		},
		{
			name:    "missing source",
			log:     Log{MediaID: "asset-123", OffsetIn: 1000},
			wantErr: true,
		},
		{
			name:    "non-uuid tag",
			log:     Log{MediaID: "asset-123", OffsetIn: 1000, Tags: []string{"not-a-uuid"}, Source: "manual"},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.log.Validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("Validate() err = %v, wantErr = %v", err, tc.wantErr)
			}
			if tc.errIs != nil && !errors.Is(err, tc.errIs) {
				t.Fatalf("expected errors.Is(err, %v), got %v", tc.errIs, err)
			}
		})
	}
}
