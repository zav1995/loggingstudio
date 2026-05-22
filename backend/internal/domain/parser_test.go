package domain

import (
	"encoding/json"
	"testing"
)

func TestIngestParserValidate(t *testing.T) {
	mapping := json.RawMessage(`{"offset_in":{"type":"literal","value":0}}`)

	cases := []struct {
		name    string
		p       IngestParser
		wantErr bool
	}{
		{
			name: "valid xml parser",
			p: IngestParser{
				Name:          "rg_xml",
				SourceFormat:  "xml",
				SamplePayload: "<Log/>",
				Mapping:       mapping,
			},
		},
		{
			name: "valid json parser",
			p: IngestParser{
				Name:          "stats_perform",
				SourceFormat:  "json",
				SamplePayload: "{}",
				Mapping:       mapping,
			},
		},
		{
			name: "invalid source format",
			p: IngestParser{
				Name:          "weird",
				SourceFormat:  "yaml",
				SamplePayload: "k: v",
				Mapping:       mapping,
			},
			wantErr: true,
		},
		{
			name: "missing mapping",
			p: IngestParser{
				Name:          "broken",
				SourceFormat:  "xml",
				SamplePayload: "<Log/>",
			},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.p.Validate()
			if (err != nil) != tc.wantErr {
				t.Fatalf("Validate() err = %v, wantErr = %v", err, tc.wantErr)
			}
		})
	}
}
