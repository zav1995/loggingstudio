package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
	"github.com/zav1995/loggingstudio/backend/internal/domain"
	"github.com/zav1995/loggingstudio/backend/internal/events"
)

type createLogRequest struct {
	MediaID   string   `json:"media_id"`
	OffsetIn  int64    `json:"offset_in"`
	OffsetOut *int64   `json:"offset_out,omitempty"`
	Tags      []string `json:"tags"`
	Source    string   `json:"source"`
}

func (s *Server) createLog(c *gin.Context) {
	var req createLogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}
	if req.Source == "" {
		req.Source = "manual"
	}

	l := domain.Log{
		MediaID:   req.MediaID,
		OffsetIn:  req.OffsetIn,
		OffsetOut: req.OffsetOut,
		Tags:      req.Tags,
		Source:    req.Source,
	}
	if err := l.Validate(); err != nil {
		jsonError(c, http.StatusUnprocessableEntity, "validation failed", err.Error())
		return
	}

	tagsJSON, err := json.Marshal(l.Tags)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "encode tags", err.Error())
		return
	}

	row, err := s.q.CreateLog(c.Request.Context(), queries.CreateLogParams{
		MediaID:   l.MediaID,
		OffsetIn:  l.OffsetIn,
		OffsetOut: l.OffsetOut,
		Tags:      tagsJSON,
		Source:    l.Source,
	})
	if err != nil {
		if isForeignKeyViolation(err) {
			jsonError(c, http.StatusUnprocessableEntity, "media_id does not reference an existing media", err.Error())
			return
		}
		jsonError(c, http.StatusInternalServerError, "create failed", err.Error())
		return
	}
	created := logRowToDomain(row)
	s.broker.Publish(events.Event{Type: "log.created", Payload: created})
	c.JSON(http.StatusCreated, created)
}

func (s *Server) listLogs(c *gin.Context) {
	mediaID := c.Query("media_id")
	if mediaID == "" {
		jsonError(c, http.StatusBadRequest, "media_id is required", "")
		return
	}
	params := queries.ListLogsParams{MediaID: mediaID}
	if v := c.Query("tag_id"); v != "" {
		params.TagID = &v
	}
	if v := c.Query("source"); v != "" {
		params.Source = &v
	}
	if v := c.Query("session_id"); v != "" {
		sid, err := parseUUID(v)
		if err != nil {
			jsonError(c, http.StatusBadRequest, "invalid session_id", err.Error())
			return
		}
		params.SessionID = sid
	}
	rows, err := s.q.ListLogs(c.Request.Context(), params)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "list failed", err.Error())
		return
	}
	out := make([]domain.Log, 0, len(rows))
	for _, r := range rows {
		out = append(out, logRowToDomain(r))
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) getLog(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	row, err := s.q.GetLog(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "log not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "lookup failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, logRowToDomain(row))
}

func (s *Server) updateLog(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	// Partial update: nil pointer = no change. Clearing offset_out is not
	// supported at MVP — delete + re-create if you really need to drop the
	// out-point on an existing log.
	var req struct {
		OffsetIn  *int64    `json:"offset_in,omitempty"`
		OffsetOut *int64    `json:"offset_out,omitempty"`
		Tags      *[]string `json:"tags,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}
	if req.OffsetIn != nil && *req.OffsetIn < 0 {
		jsonError(c, http.StatusUnprocessableEntity, "offset_in must be >= 0", "")
		return
	}
	if req.OffsetIn != nil && req.OffsetOut != nil && *req.OffsetOut < *req.OffsetIn {
		jsonError(c, http.StatusUnprocessableEntity, domain.ErrLogOffsetOutBeforeIn.Error(), "")
		return
	}

	params := queries.UpdateLogParams{ID: id, OffsetIn: req.OffsetIn, OffsetOut: req.OffsetOut}
	if req.Tags != nil {
		// Validate tag UUIDs early, before hitting the DB.
		for _, t := range *req.Tags {
			if _, err := parseUUID(t); err != nil {
				jsonError(c, http.StatusUnprocessableEntity, "tag id is not a UUID", err.Error())
				return
			}
		}
		tagsJSON, err := json.Marshal(*req.Tags)
		if err != nil {
			jsonError(c, http.StatusInternalServerError, "encode tags", err.Error())
			return
		}
		params.Tags = tagsJSON
	}

	row, err := s.q.UpdateLog(c.Request.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "log not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "update failed", err.Error())
		return
	}
	updated := logRowToDomain(row)
	s.broker.Publish(events.Event{Type: "log.updated", Payload: updated})
	c.JSON(http.StatusOK, updated)
}

func (s *Server) deleteLog(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	if err := s.q.DeleteLog(c.Request.Context(), id); err != nil {
		jsonError(c, http.StatusInternalServerError, "delete failed", err.Error())
		return
	}
	s.broker.Publish(events.Event{Type: "log.deleted", Payload: gin.H{"id": c.Param("id")}})
	c.Status(http.StatusNoContent)
}

func logRowToDomain(l queries.Log) domain.Log {
	out := domain.Log{
		MediaID:   l.MediaID,
		OffsetIn:  l.OffsetIn,
		OffsetOut: l.OffsetOut,
		Source:    l.Source,
		Tags:      []string{},
	}
	if l.ID.Valid {
		out.ID = uuidToString(l.ID)
	}
	if len(l.Tags) > 0 {
		var tags []string
		if err := json.Unmarshal(l.Tags, &tags); err == nil {
			out.Tags = tags
		}
	}
	if l.CreatedAt.Valid {
		out.CreatedAt = l.CreatedAt.Time
	}
	if l.UpdatedAt.Valid {
		out.UpdatedAt = l.UpdatedAt.Time
	}
	return out
}
