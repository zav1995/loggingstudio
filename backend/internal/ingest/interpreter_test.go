package ingest

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/zav1995/loggingstudio/backend/internal/domain"
)

// sampleDataPath resolves a file under the repo's sample-data/ directory from
// inside the ingest package's test working dir (backend/internal/ingest).
func sampleDataPath(t *testing.T, parts ...string) string {
	t.Helper()
	base := []string{"..", "..", "..", "sample-data"}
	return filepath.Join(append(base, parts...)...)
}

// TestProcessRGSample is the load-bearing fixture test for I1: it runs the
// canonical RG parser against the canonical RG XML and asserts the exact
// outputs documented in PRD §3.4.
func TestProcessRGSample(t *testing.T) {
	payload, err := os.ReadFile(sampleDataPath(t, "rg-point.xml"))
	if err != nil {
		t.Fatalf("read rg-point.xml: %v", err)
	}
	parserJSON, err := os.ReadFile(sampleDataPath(t, "parsers", "rg-xml.json"))
	if err != nil {
		t.Fatalf("read rg-xml.json: %v", err)
	}
	var parser Parser
	if err := json.Unmarshal(parserJSON, &parser); err != nil {
		t.Fatalf("unmarshal parser: %v", err)
	}

	media := &domain.Media{
		ID:          "asset-rg26-court13",
		HLSURL:      "https://example.com/stream.m3u8",
		StartedAtTC: "17:30:00:00",
		FrameRate:   25,
	}

	// Deterministic tag resolver: returns a stable id derived from the name.
	resolve := func(name string, _ string) (string, error) {
		return "tag:" + name, nil
	}

	res, err := Process(&parser, payload, "xml", Context{Media: media, TagResolver: resolve})
	if err != nil {
		t.Fatalf("Process: %v", err)
	}
	if res.Reject != "" {
		t.Fatalf("unexpected reject: %s", res.Reject)
	}
	if res.Log == nil {
		t.Fatal("Process returned nil Log without a reject reason")
	}

	// PRD §3.4: TC = 17:35:00:08, anchor 17:30:00:00 @ 25fps →
	//   delta = 5*60s + 8 frames = 300_000ms + 320ms = 300_320ms
	//   minus_ms = 5000 → offset_in = 295_320
	//   plus_ms  = 2000 → offset_out = 302_320
	if got := res.Log.OffsetIn; got != 295_320 {
		t.Errorf("OffsetIn = %d, want 295320", got)
	}
	if res.Log.OffsetOut == nil {
		t.Fatal("OffsetOut is nil, want 302320")
	}
	if got := *res.Log.OffsetOut; got != 302_320 {
		t.Errorf("OffsetOut = %d, want 302320", got)
	}

	// PRD §3.4 tag set, in document order.
	wantTags := []string{
		"tag:Backhand",
		"tag:Volley",
		"tag:Break point",
		"tag:Game point",
		"tag:Winner",
		"tag:Advantage side",
	}
	if got := res.Log.Tags; !equalStrings(got, wantTags) {
		t.Errorf("Tags = %v, want %v", got, wantTags)
	}

	if res.Log.Source != "ingest:rg_xml" {
		t.Errorf("Source = %q, want ingest:rg_xml", res.Log.Source)
	}
	if res.Log.MediaID != "asset-rg26-court13" {
		t.Errorf("MediaID = %q, want asset-rg26-court13", res.Log.MediaID)
	}
}

func TestProcessFilterRejects(t *testing.T) {
	payload, err := os.ReadFile(sampleDataPath(t, "rg-point.xml"))
	if err != nil {
		t.Fatalf("read rg-point.xml: %v", err)
	}
	// Same parser but with a Court filter that doesn't match — should reject.
	parser := Parser{
		Match: "Log",
		Filters: []FilterRule{
			{Path: "UserFields/UserField[@Header='Court']", Op: "eq", Value: "Court 99"},
		},
		Mapping: Mapping{
			OffsetIn: Rule{Type: "literal", Value: json.RawMessage(`0`)},
			Tags:     Rule{Type: "literal", Value: json.RawMessage(`[]`)},
			Source:   Rule{Type: "literal", Value: json.RawMessage(`"ingest:test"`)},
		},
	}
	media := &domain.Media{
		ID: "x", HLSURL: "https://e.com/s.m3u8", StartedAtTC: "00:00:00:00", FrameRate: 25,
	}
	res, err := Process(&parser, payload, "xml", Context{Media: media, TagResolver: noResolver})
	if err != nil {
		t.Fatalf("Process: %v", err)
	}
	if res.Reject == "" {
		t.Fatalf("expected reject, got log %+v", res.Log)
	}
}

func TestProcessStrictUnknownTagRejects(t *testing.T) {
	payload, err := os.ReadFile(sampleDataPath(t, "rg-point.xml"))
	if err != nil {
		t.Fatalf("read rg-point.xml: %v", err)
	}
	parser := Parser{
		Match:         "Log",
		TagLookupMode: "strict",
		Mapping: Mapping{
			OffsetIn: Rule{Type: "literal", Value: json.RawMessage(`0`)},
			Tags: Rule{
				Type: "tag_lookup_by_name",
				Path: "Keywords/Keyword[@Type='Keyword']",
			},
			Source: Rule{Type: "literal", Value: json.RawMessage(`"ingest:test"`)},
		},
	}
	media := &domain.Media{
		ID: "x", HLSURL: "https://e.com/s.m3u8", StartedAtTC: "00:00:00:00", FrameRate: 25,
	}
	// Resolver that never knows any tag → strict mode should reject.
	strictUnknown := func(_ string, _ string) (string, error) {
		return "", ErrUnknownTag
	}
	res, err := Process(&parser, payload, "xml", Context{Media: media, TagResolver: strictUnknown})
	if err != nil {
		t.Fatalf("Process: %v", err)
	}
	if res.Reject == "" {
		t.Fatalf("expected strict-mode reject, got log %+v", res.Log)
	}
}

func TestTimecodeToMs(t *testing.T) {
	cases := []struct {
		tc, anchor string
		rate       int
		want       int64
	}{
		{"17:30:00:00", "17:30:00:00", 25, 0},
		{"17:35:00:08", "17:30:00:00", 25, 300_320},
		{"00:00:01:00", "00:00:00:00", 25, 1_000},
		{"00:00:00:01", "00:00:00:00", 25, 40}, // 1/25 = 0.04s = 40ms
	}
	for _, c := range cases {
		got, err := timecodeToMs(c.tc, c.anchor, c.rate)
		if err != nil {
			t.Errorf("timecodeToMs(%q, %q, %d) err = %v", c.tc, c.anchor, c.rate, err)
			continue
		}
		if got != c.want {
			t.Errorf("timecodeToMs(%q, %q, %d) = %d, want %d", c.tc, c.anchor, c.rate, got, c.want)
		}
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func noResolver(_ string, _ string) (string, error) { return "", nil }
