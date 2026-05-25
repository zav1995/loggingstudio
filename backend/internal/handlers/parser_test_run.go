package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/zav1995/loggingstudio/backend/internal/domain"
	"github.com/zav1995/loggingstudio/backend/internal/ingest"
)

type testParserRequest struct {
	Payload string `json:"payload"`
	MediaID string `json:"media_id"`
}

type testRejected struct {
	Reason string `json:"reason"`
	Raw    string `json:"raw,omitempty"`
}

type testParserResponse struct {
	PredictedLogs []domain.Log   `json:"predicted_logs"`
	Rejected      []testRejected `json:"rejected"`
}

// testParser runs a stored parser against a one-off payload without
// persisting anything — used by the FE9 wizard's preview pane. Tag lookup
// is read-only here (no "Imported" group creation) so a preview can't side-
// effect the tag taxonomy.
func (s *Server) testParser(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	var req testParserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}
	if req.MediaID == "" {
		jsonError(c, http.StatusBadRequest, "media_id is required", "")
		return
	}
	if req.Payload == "" {
		jsonError(c, http.StatusBadRequest, "payload is required", "")
		return
	}

	parserRow, err := s.q.GetParser(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "parser not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "lookup parser", err.Error())
		return
	}
	mediaRow, err := s.q.GetMedia(c.Request.Context(), req.MediaID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusUnprocessableEntity, "media_id does not reference an existing media", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "lookup media", err.Error())
		return
	}

	parser, err := assembleInterpreterParser(parserRow.Mapping, parserRow.Filter)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "decode parser", err.Error())
		return
	}
	media := mediaRowToDomain(mediaRow)

	res, err := ingest.Process(parser, []byte(req.Payload), parserRow.SourceFormat, ingest.Context{
		Media:       &media,
		TagResolver: s.readOnlyTagResolver(c.Request.Context()),
	})
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "interpreter", err.Error())
		return
	}

	out := testParserResponse{PredictedLogs: []domain.Log{}, Rejected: []testRejected{}}
	if res.Log != nil {
		out.PredictedLogs = append(out.PredictedLogs, *res.Log)
	}
	if res.Reject != "" {
		out.Rejected = append(out.Rejected, testRejected{Reason: res.Reject, Raw: req.Payload})
	}
	c.JSON(http.StatusOK, out)
}

// assembleInterpreterParser builds the interpreter's Parser shape from the
// column split. Used by test-run and (eventually) by the watch loop.
func assembleInterpreterParser(mapping, filter json.RawMessage) (*ingest.Parser, error) {
	var m ingest.Mapping
	if err := json.Unmarshal(mapping, &m); err != nil {
		return nil, err
	}
	var filters []ingest.FilterRule
	if len(filter) > 0 {
		if err := json.Unmarshal(filter, &filters); err != nil {
			return nil, err
		}
	}
	return &ingest.Parser{
		Match:         "Log",
		Filters:       filters,
		Mapping:       m,
		TagLookupMode: "lenient",
	}, nil
}

// readOnlyTagResolver looks up tags by name and never creates new ones. In
// lenient mode unknown names are silently dropped (interpreter behavior);
// in strict mode the interpreter receives ErrUnknownTag.
func (s *Server) readOnlyTagResolver(ctx context.Context) ingest.TagResolver {
	return func(name, _ string) (string, error) {
		tag, err := s.q.GetTagByName(ctx, name)
		if err == nil {
			return uuidToString(tag.ID), nil
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ingest.ErrUnknownTag
		}
		return "", err
	}
}
