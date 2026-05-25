package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
	"github.com/zav1995/loggingstudio/backend/internal/domain"
	"github.com/zav1995/loggingstudio/backend/internal/ingest"
)

type createParserRequest struct {
	Name          string          `json:"name"`
	SourceFormat  string          `json:"source_format"`
	SamplePayload string          `json:"sample_payload"`
	Mapping       json.RawMessage `json:"mapping"`
	Filter        json.RawMessage `json:"filter,omitempty"`
	TagLookupMode string          `json:"tag_lookup_mode,omitempty"`
}

// createParser validates the assembled parser document against
// shared/parser-schema.json before persisting; the DB column split
// (mapping/filter) is reassembled into a single parser document for
// validation.
func (s *Server) createParser(c *gin.Context) {
	var req createParserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}

	p := domain.IngestParser{
		Name:          req.Name,
		SourceFormat:  req.SourceFormat,
		SamplePayload: req.SamplePayload,
		Mapping:       req.Mapping,
		Filter:        req.Filter,
	}
	if err := p.Validate(); err != nil {
		jsonError(c, http.StatusUnprocessableEntity, "validation failed", err.Error())
		return
	}

	doc, err := ingest.AssembleParserDoc(req.Mapping, req.Filter, req.TagLookupMode)
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid parser shape", err.Error())
		return
	}
	if err := ingest.ValidateParserDoc(doc); err != nil {
		var ve *ingest.ValidationError
		if errors.As(err, &ve) {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error":  "parser does not match shared/parser-schema.json",
				"detail": ve.Detail,
			})
			return
		}
		jsonError(c, http.StatusUnprocessableEntity, "schema validation failed", err.Error())
		return
	}

	row, err := s.q.CreateParser(c.Request.Context(), queries.CreateParserParams{
		Name:          req.Name,
		SourceFormat:  req.SourceFormat,
		SamplePayload: req.SamplePayload,
		Mapping:       req.Mapping,
		Filter:        ensureJSONArray(req.Filter),
	})
	if err != nil {
		if isUniqueViolation(err) {
			jsonError(c, http.StatusConflict, "parser name already in use", err.Error())
			return
		}
		jsonError(c, http.StatusInternalServerError, "create failed", err.Error())
		return
	}
	c.JSON(http.StatusCreated, parserRowToDomain(row))
}

func (s *Server) listParsers(c *gin.Context) {
	rows, err := s.q.ListParsers(c.Request.Context())
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "list failed", err.Error())
		return
	}
	out := make([]domain.IngestParser, 0, len(rows))
	for _, r := range rows {
		out = append(out, parserRowToDomain(r))
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) getParser(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	row, err := s.q.GetParser(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "parser not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "lookup failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, parserRowToDomain(row))
}

func (s *Server) updateParser(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	var req struct {
		Name          *string         `json:"name,omitempty"`
		SourceFormat  *string         `json:"source_format,omitempty"`
		SamplePayload *string         `json:"sample_payload,omitempty"`
		Mapping       json.RawMessage `json:"mapping,omitempty"`
		Filter        json.RawMessage `json:"filter,omitempty"`
		TagLookupMode string          `json:"tag_lookup_mode,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}

	// When mapping or filter is being changed, re-validate against the
	// schema using the new + existing pieces.
	if len(req.Mapping) > 0 || len(req.Filter) > 0 {
		existing, err := s.q.GetParser(c.Request.Context(), id)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				jsonError(c, http.StatusNotFound, "parser not found", "")
				return
			}
			jsonError(c, http.StatusInternalServerError, "lookup failed", err.Error())
			return
		}
		mapping := req.Mapping
		if len(mapping) == 0 {
			mapping = existing.Mapping
		}
		filter := req.Filter
		if len(filter) == 0 {
			filter = existing.Filter
		}
		doc, err := ingest.AssembleParserDoc(mapping, filter, req.TagLookupMode)
		if err != nil {
			jsonError(c, http.StatusBadRequest, "invalid parser shape", err.Error())
			return
		}
		if err := ingest.ValidateParserDoc(doc); err != nil {
			var ve *ingest.ValidationError
			if errors.As(err, &ve) {
				c.JSON(http.StatusUnprocessableEntity, gin.H{
					"error":  "parser does not match shared/parser-schema.json",
					"detail": ve.Detail,
				})
				return
			}
			jsonError(c, http.StatusUnprocessableEntity, "schema validation failed", err.Error())
			return
		}
	}

	params := queries.UpdateParserParams{
		ID:            id,
		Name:          req.Name,
		SourceFormat:  req.SourceFormat,
		SamplePayload: req.SamplePayload,
		Mapping:       req.Mapping,
		Filter:        req.Filter,
	}
	row, err := s.q.UpdateParser(c.Request.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "parser not found", "")
			return
		}
		if isUniqueViolation(err) {
			jsonError(c, http.StatusConflict, "parser name already in use", err.Error())
			return
		}
		jsonError(c, http.StatusInternalServerError, "update failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, parserRowToDomain(row))
}

func (s *Server) deleteParser(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	if err := s.q.DeleteParser(c.Request.Context(), id); err != nil {
		jsonError(c, http.StatusInternalServerError, "delete failed", err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func parserRowToDomain(p queries.IngestParser) domain.IngestParser {
	out := domain.IngestParser{
		Name:          p.Name,
		SourceFormat:  p.SourceFormat,
		SamplePayload: p.SamplePayload,
		Mapping:       p.Mapping,
		Filter:        p.Filter,
	}
	if p.ID.Valid {
		out.ID = uuidToString(p.ID)
	}
	if p.CreatedAt.Valid {
		out.CreatedAt = p.CreatedAt.Time
	}
	if p.UpdatedAt.Valid {
		out.UpdatedAt = p.UpdatedAt.Time
	}
	return out
}

// ensureJSONArray returns a guaranteed-valid jsonb array for the filter
// column. The DB default is '[]'::jsonb but an empty request omits the
// field, leaving a nil RawMessage that the driver writes as SQL NULL,
// which violates the NOT NULL constraint.
func ensureJSONArray(raw json.RawMessage) []byte {
	if len(raw) == 0 {
		return []byte("[]")
	}
	return raw
}
