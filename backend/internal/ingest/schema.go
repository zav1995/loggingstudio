package ingest

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

// schema.json is kept in sync with shared/parser-schema.json by the
// //go:generate directive below. Run `go generate ./...` from backend/ if you
// edit the canonical schema.
//
//go:generate cp ../../../shared/parser-schema.json schema.json
//go:embed schema.json
var schemaBytes []byte

var compiledSchema = mustCompileSchema()

func mustCompileSchema() *jsonschema.Schema {
	compiler := jsonschema.NewCompiler()
	compiler.Draft = jsonschema.Draft2020
	if err := compiler.AddResource("parser-schema.json", bytes.NewReader(schemaBytes)); err != nil {
		panic(fmt.Errorf("load parser schema: %w", err))
	}
	s, err := compiler.Compile("parser-schema.json")
	if err != nil {
		panic(fmt.Errorf("compile parser schema: %w", err))
	}
	return s
}

// ValidateParserDoc validates a parser document (the full {match, filters,
// mapping, tag_lookup_mode} JSON) against shared/parser-schema.json. Returns
// nil on success or a *ValidationError with field-path detail on failure.
func ValidateParserDoc(doc any) error {
	if err := compiledSchema.Validate(doc); err != nil {
		var ve *jsonschema.ValidationError
		if errors.As(err, &ve) {
			return &ValidationError{Detail: formatValidationError(ve)}
		}
		return err
	}
	return nil
}

// ValidationError is the surfaced shape — Detail is a list of "path: reason"
// strings suitable for a 422 response body.
type ValidationError struct {
	Detail []string
}

func (e *ValidationError) Error() string {
	return strings.Join(e.Detail, "; ")
}

func formatValidationError(ve *jsonschema.ValidationError) []string {
	out := []string{}
	var walk func(v *jsonschema.ValidationError)
	walk = func(v *jsonschema.ValidationError) {
		if v.Message != "" {
			loc := v.InstanceLocation
			if loc == "" {
				loc = "/"
			}
			out = append(out, fmt.Sprintf("%s: %s", loc, v.Message))
		}
		for _, c := range v.Causes {
			walk(c)
		}
	}
	walk(ve)
	return out
}

// AssembleParserDoc reassembles a full parser document from the column shape
// the DB stores (mapping + filter as separate jsonb blobs). Used by the
// CRUD handler before calling ValidateParserDoc and by callers loading a
// stored parser for the interpreter.
func AssembleParserDoc(
	mapping json.RawMessage,
	filter json.RawMessage,
	tagLookupMode string,
) (map[string]any, error) {
	var m any
	if err := json.Unmarshal(mapping, &m); err != nil {
		return nil, fmt.Errorf("mapping: %w", err)
	}
	doc := map[string]any{
		"match":   "Log",
		"mapping": m,
	}
	if len(filter) > 0 {
		var f any
		if err := json.Unmarshal(filter, &f); err != nil {
			return nil, fmt.Errorf("filter: %w", err)
		}
		doc["filters"] = f
	}
	if tagLookupMode != "" {
		doc["tag_lookup_mode"] = tagLookupMode
	}
	return doc, nil
}
