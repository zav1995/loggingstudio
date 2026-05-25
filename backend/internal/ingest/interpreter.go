// Package ingest contains the parser interpreter and (eventually) the watch
// loop that drives sidecar XML/JSON files through it.
//
// The interpreter is deterministic and pure-Go — no LLM at runtime, per the
// project rule. It takes a compiled parser, a payload byte slice, and a small
// runtime context (the active Media plus a tag resolver provided by the
// caller) and produces either a *domain.Log or a rejection reason.
package ingest

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/antchfx/jsonquery"
	"github.com/antchfx/xmlquery"

	"github.com/zav1995/loggingstudio/backend/internal/domain"
)

// TagResolver returns the tag id for a given name. mode is "strict" or
// "lenient" — in lenient mode the resolver may create the tag (typically in
// an "Imported" group) and return its new id; in strict mode it returns
// ErrUnknownTag for any unknown name and the interpreter rejects the log.
type TagResolver func(name string, mode string) (string, error)

// ErrUnknownTag is the sentinel returned by a TagResolver in strict mode when
// it doesn't know the tag name.
var ErrUnknownTag = errors.New("unknown tag")

// Context carries the runtime state the interpreter needs that isn't on the
// parser itself.
type Context struct {
	Media       *domain.Media
	TagResolver TagResolver
}

// Result is the outcome of running a parser against a payload.
// Log is non-nil on success; Reject carries a one-line explanation when the
// payload was filtered out or evaluation failed in a recoverable way.
type Result struct {
	Log    *domain.Log
	Reject string
}

// Compiled parsers — the JSON shape lives in shared/parser-schema.json; this
// struct mirrors it on the Go side. Used for both the interpreter's input
// and the schema-validation handler in I2.
type Parser struct {
	Match          string       `json:"match"`
	Filters        []FilterRule `json:"filters"`
	Mapping        Mapping      `json:"mapping"`
	TagLookupMode  string       `json:"tag_lookup_mode,omitempty"`
}

type FilterRule struct {
	Path  string `json:"path"`
	Op    string `json:"op"`
	Value string `json:"value"`
}

type Mapping struct {
	OffsetIn  Rule  `json:"offset_in"`
	OffsetOut *Rule `json:"offset_out,omitempty"`
	Tags      Rule  `json:"tags"`
	Source    Rule  `json:"source"`
}

// Rule is a single mapping op. Fields beyond Type are populated based on the
// op type; the schema validator (I2) keeps the JSON honest, so the
// interpreter trusts the discriminator and only checks fields it needs.
//
// Value is overloaded between literal (any JSON value) and lower/trim/
// regex_extract (a nested Rule). Kept as json.RawMessage and parsed inside
// Eval based on Type.
type Rule struct {
	Type      string          `json:"type"`
	Value     json.RawMessage `json:"value,omitempty"`
	Path      string          `json:"path,omitempty"`
	MinusMs   int64           `json:"minus_ms,omitempty"`
	PlusMs    int64           `json:"plus_ms,omitempty"`
	Pattern   string          `json:"pattern,omitempty"`
	Group     int             `json:"group,omitempty"`
	Parts     []Rule          `json:"parts,omitempty"`
	Separator string          `json:"separator,omitempty"`
}

// Process runs parser against payload using ctx. sourceFormat is "xml" or
// "json" and decides how paths are resolved (XPath vs JSONPath/XPath-on-JSON
// via antchfx).
func Process(
	parser *Parser,
	payload []byte,
	sourceFormat string,
	ctx Context,
) (*Result, error) {
	if ctx.Media == nil {
		return nil, errors.New("Context.Media is required")
	}
	mode := parser.TagLookupMode
	if mode == "" {
		mode = "lenient"
	}

	doc, err := parseDoc(payload, sourceFormat)
	if err != nil {
		return &Result{Reject: fmt.Sprintf("parse %s payload: %v", sourceFormat, err)}, nil
	}
	ev := &evaluator{
		sourceFormat: sourceFormat,
		doc:          doc,
		media:        ctx.Media,
		tagResolver:  ctx.TagResolver,
		mode:         mode,
	}

	// Filters first — short-circuit to Reject without running mapping.
	for _, f := range parser.Filters {
		ok, reason, err := ev.applyFilter(f)
		if err != nil {
			return &Result{Reject: fmt.Sprintf("filter %q: %v", f.Path, err)}, nil
		}
		if !ok {
			return &Result{Reject: reason}, nil
		}
	}

	// Mapping.
	offsetIn, err := ev.evalInt64(parser.Mapping.OffsetIn)
	if err != nil {
		return &Result{Reject: fmt.Sprintf("offset_in: %v", err)}, nil
	}

	var offsetOut *int64
	if parser.Mapping.OffsetOut != nil {
		v, err := ev.evalInt64(*parser.Mapping.OffsetOut)
		if err != nil {
			return &Result{Reject: fmt.Sprintf("offset_out: %v", err)}, nil
		}
		offsetOut = &v
	}

	tagsVal, err := ev.eval(parser.Mapping.Tags)
	if err != nil {
		if errors.Is(err, ErrUnknownTag) {
			return &Result{Reject: fmt.Sprintf("tags: %v", err)}, nil
		}
		return &Result{Reject: fmt.Sprintf("tags: %v", err)}, nil
	}
	tagIDs, err := coerceStringSlice(tagsVal)
	if err != nil {
		return &Result{Reject: fmt.Sprintf("tags: %v", err)}, nil
	}

	sourceVal, err := ev.eval(parser.Mapping.Source)
	if err != nil {
		return &Result{Reject: fmt.Sprintf("source: %v", err)}, nil
	}
	source, ok := sourceVal.(string)
	if !ok {
		return &Result{Reject: fmt.Sprintf("source must be string, got %T", sourceVal)}, nil
	}

	log := &domain.Log{
		MediaID:   ctx.Media.ID,
		OffsetIn:  offsetIn,
		OffsetOut: offsetOut,
		Tags:      tagIDs,
		Source:    source,
	}
	return &Result{Log: log}, nil
}

// --- evaluator ---

type evaluator struct {
	sourceFormat string
	doc          docNode
	media        *domain.Media
	tagResolver  TagResolver
	mode         string
}

// docNode unifies the two antchfx node types behind one interface so the
// rest of the evaluator doesn't case on sourceFormat at every step.
type docNode interface {
	first(path string) (string, error)     // text of first match, "" if none
	all(path string) ([]string, error)     // text of all matches
}

type xmlDoc struct{ root *xmlquery.Node }

func (d xmlDoc) first(path string) (string, error) {
	n, err := xmlquery.Query(d.root, path)
	if err != nil {
		return "", err
	}
	if n == nil {
		return "", nil
	}
	return strings.TrimSpace(n.InnerText()), nil
}

func (d xmlDoc) all(path string) ([]string, error) {
	ns, err := xmlquery.QueryAll(d.root, path)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(ns))
	for _, n := range ns {
		out = append(out, strings.TrimSpace(n.InnerText()))
	}
	return out, nil
}

type jsonDoc struct{ root *jsonquery.Node }

func (d jsonDoc) first(path string) (string, error) {
	n, err := jsonquery.Query(d.root, path)
	if err != nil {
		return "", err
	}
	if n == nil {
		return "", nil
	}
	return strings.TrimSpace(n.InnerText()), nil
}

func (d jsonDoc) all(path string) ([]string, error) {
	ns, err := jsonquery.QueryAll(d.root, path)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(ns))
	for _, n := range ns {
		out = append(out, strings.TrimSpace(n.InnerText()))
	}
	return out, nil
}

func parseDoc(payload []byte, format string) (docNode, error) {
	switch format {
	case "xml":
		// xmlquery handles BOM and the XML declaration. Walk past the
		// document node (XML declaration + comments) to the root element so
		// user-written paths can be relative to the document root rather
		// than the doc node (which would force /RootName/... everywhere).
		doc, err := xmlquery.Parse(bytes.NewReader(payload))
		if err != nil {
			return nil, err
		}
		root := doc.FirstChild
		for root != nil && root.Type != xmlquery.ElementNode {
			root = root.NextSibling
		}
		if root == nil {
			return nil, errors.New("no root element")
		}
		return xmlDoc{root: root}, nil
	case "json":
		root, err := jsonquery.Parse(bytes.NewReader(payload))
		if err != nil {
			return nil, err
		}
		return jsonDoc{root: root}, nil
	default:
		return nil, fmt.Errorf("unsupported source_format %q", format)
	}
}

// --- filter ---

func (e *evaluator) applyFilter(f FilterRule) (ok bool, reason string, err error) {
	v, err := e.doc.first(f.Path)
	if err != nil {
		return false, "", err
	}
	switch f.Op {
	case "eq":
		if v == f.Value {
			return true, "", nil
		}
		return false, fmt.Sprintf("filter %s != %q (got %q)", f.Path, f.Value, v), nil
	case "neq":
		if v != f.Value {
			return true, "", nil
		}
		return false, fmt.Sprintf("filter %s == %q", f.Path, f.Value), nil
	case "contains":
		if strings.Contains(v, f.Value) {
			return true, "", nil
		}
		return false, fmt.Sprintf("filter %s !contains %q", f.Path, f.Value), nil
	case "matches":
		re, err := regexp.Compile(f.Value)
		if err != nil {
			return false, "", fmt.Errorf("bad regex: %w", err)
		}
		if re.MatchString(v) {
			return true, "", nil
		}
		return false, fmt.Sprintf("filter %s !match %q", f.Path, f.Value), nil
	default:
		return false, "", fmt.Errorf("unknown filter op %q", f.Op)
	}
}

// --- eval ---

func (e *evaluator) eval(r Rule) (any, error) {
	switch r.Type {
	case "literal":
		var v any
		if err := json.Unmarshal(r.Value, &v); err != nil {
			return nil, fmt.Errorf("literal: %w", err)
		}
		return v, nil

	case "xpath", "jsonpath":
		return e.doc.first(r.Path)

	case "timecode_to_ms":
		raw, err := e.doc.first(r.Path)
		if err != nil {
			return nil, err
		}
		if raw == "" {
			return nil, fmt.Errorf("no value at %q", r.Path)
		}
		ms, err := timecodeToMs(raw, e.media.StartedAtTC, e.media.FrameRate)
		if err != nil {
			return nil, err
		}
		out := ms - r.MinusMs + r.PlusMs
		if out < 0 {
			return nil, fmt.Errorf("timecode_to_ms produced negative offset (%d)", out)
		}
		return out, nil

	case "tag_lookup_by_name":
		names, err := e.doc.all(r.Path)
		if err != nil {
			return nil, err
		}
		ids := make([]string, 0, len(names))
		for _, n := range names {
			if n == "" {
				continue
			}
			id, err := e.tagResolver(n, e.mode)
			if err != nil {
				if errors.Is(err, ErrUnknownTag) {
					if e.mode == "strict" {
						return nil, err
					}
					continue
				}
				return nil, err
			}
			if id != "" {
				ids = append(ids, id)
			}
		}
		return ids, nil

	case "concat":
		parts := make([]string, 0, len(r.Parts))
		for _, p := range r.Parts {
			v, err := e.eval(p)
			if err != nil {
				return nil, err
			}
			parts = append(parts, fmt.Sprintf("%v", v))
		}
		return strings.Join(parts, r.Separator), nil

	case "lower":
		inner, err := e.evalNestedValue(r.Value)
		if err != nil {
			return nil, err
		}
		s, ok := inner.(string)
		if !ok {
			return nil, fmt.Errorf("lower: expected string, got %T", inner)
		}
		return strings.ToLower(s), nil

	case "trim":
		inner, err := e.evalNestedValue(r.Value)
		if err != nil {
			return nil, err
		}
		s, ok := inner.(string)
		if !ok {
			return nil, fmt.Errorf("trim: expected string, got %T", inner)
		}
		return strings.TrimSpace(s), nil

	case "regex_extract":
		inner, err := e.evalNestedValue(r.Value)
		if err != nil {
			return nil, err
		}
		s, ok := inner.(string)
		if !ok {
			return nil, fmt.Errorf("regex_extract: expected string, got %T", inner)
		}
		re, err := regexp.Compile(r.Pattern)
		if err != nil {
			return nil, fmt.Errorf("regex_extract: bad pattern: %w", err)
		}
		m := re.FindStringSubmatch(s)
		if m == nil {
			return "", nil
		}
		idx := r.Group
		if idx < 0 || idx >= len(m) {
			return nil, fmt.Errorf("regex_extract: group %d out of range", r.Group)
		}
		return m[idx], nil

	default:
		return nil, fmt.Errorf("unknown rule type %q", r.Type)
	}
}

func (e *evaluator) evalInt64(r Rule) (int64, error) {
	v, err := e.eval(r)
	if err != nil {
		return 0, err
	}
	switch x := v.(type) {
	case int64:
		return x, nil
	case int:
		return int64(x), nil
	case float64:
		return int64(x), nil
	default:
		return 0, fmt.Errorf("expected int-like, got %T", v)
	}
}

func (e *evaluator) evalNestedValue(raw json.RawMessage) (any, error) {
	var inner Rule
	if err := json.Unmarshal(raw, &inner); err != nil {
		return nil, err
	}
	return e.eval(inner)
}

func coerceStringSlice(v any) ([]string, error) {
	switch x := v.(type) {
	case []string:
		return x, nil
	case string:
		if x == "" {
			return []string{}, nil
		}
		return []string{x}, nil
	case nil:
		return []string{}, nil
	default:
		return nil, fmt.Errorf("expected []string, got %T", v)
	}
}

// timecodeToMs computes the millisecond offset of a SMPTE HH:MM:SS:FF
// timecode relative to a media's anchor (started_at_tc) at the media's frame
// rate. Whitespace in the input is tolerated (some loggers pad TCs with
// trailing spaces).
func timecodeToMs(tc string, startedAtTC string, frameRate int) (int64, error) {
	tcFrames, err := smpteToFrames(strings.TrimSpace(tc), frameRate)
	if err != nil {
		return 0, fmt.Errorf("tc %q: %w", tc, err)
	}
	startFrames, err := smpteToFrames(strings.TrimSpace(startedAtTC), frameRate)
	if err != nil {
		return 0, fmt.Errorf("started_at_tc %q: %w", startedAtTC, err)
	}
	delta := tcFrames - startFrames
	if delta < 0 {
		return 0, fmt.Errorf("tc %q is before media start", tc)
	}
	// ms = (frames * 1000) / frame_rate, with rounding to nearest int.
	ms := (delta*1000 + int64(frameRate)/2) / int64(frameRate)
	return ms, nil
}

var smpteRE = regexp.MustCompile(`^(\d{2}):(\d{2}):(\d{2}):(\d{2})$`)

func smpteToFrames(tc string, frameRate int) (int64, error) {
	m := smpteRE.FindStringSubmatch(tc)
	if m == nil {
		return 0, fmt.Errorf("not HH:MM:SS:FF")
	}
	var h, mi, s, f int64
	fmt.Sscanf(m[1], "%d", &h)
	fmt.Sscanf(m[2], "%d", &mi)
	fmt.Sscanf(m[3], "%d", &s)
	fmt.Sscanf(m[4], "%d", &f)
	return ((h*3600+mi*60+s)*int64(frameRate) + f), nil
}
