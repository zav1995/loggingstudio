package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
	"github.com/zav1995/loggingstudio/backend/internal/domain"
)

type createSessionRequest struct {
	MediaID string `json:"media_id"`
	Name    string `json:"name"`
	Notes   string `json:"notes,omitempty"`
}

func (s *Server) createSession(c *gin.Context) {
	var req createSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}
	sess := domain.Session{MediaID: req.MediaID, Name: req.Name, Notes: req.Notes}
	if err := sess.Validate(); err != nil {
		jsonError(c, http.StatusUnprocessableEntity, "validation failed", err.Error())
		return
	}

	row, err := s.q.CreateSession(c.Request.Context(), queries.CreateSessionParams{
		MediaID: sess.MediaID,
		Name:    sess.Name,
		Notes:   optionalString(sess.Notes),
	})
	if err != nil {
		if isForeignKeyViolation(err) {
			jsonError(c, http.StatusUnprocessableEntity, "media_id does not reference an existing media", err.Error())
			return
		}
		jsonError(c, http.StatusInternalServerError, "create failed", err.Error())
		return
	}
	c.JSON(http.StatusCreated, sessionRowToDomain(row))
}

func (s *Server) listSessions(c *gin.Context) {
	mediaID := c.Query("media_id")
	if mediaID == "" {
		jsonError(c, http.StatusBadRequest, "media_id is required", "")
		return
	}
	rows, err := s.q.ListSessionsByMedia(c.Request.Context(), mediaID)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "list failed", err.Error())
		return
	}
	out := make([]domain.Session, 0, len(rows))
	for _, r := range rows {
		out = append(out, sessionRowToDomain(r))
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) getSession(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	row, err := s.q.GetSession(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "session not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "lookup failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, sessionRowToDomain(row))
}

func (s *Server) updateSession(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	var req struct {
		Name    *string    `json:"name,omitempty"`
		Notes   *string    `json:"notes,omitempty"`
		EndedAt *time.Time `json:"ended_at,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}
	params := queries.UpdateSessionParams{ID: id, Name: req.Name, Notes: req.Notes}
	if req.EndedAt != nil {
		params.EndedAt = pgtype.Timestamptz{Time: *req.EndedAt, Valid: true}
	}
	row, err := s.q.UpdateSession(c.Request.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "session not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "update failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, sessionRowToDomain(row))
}

func (s *Server) deleteSession(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	if err := s.q.DeleteSession(c.Request.Context(), id); err != nil {
		jsonError(c, http.StatusInternalServerError, "delete failed", err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func sessionRowToDomain(s queries.Session) domain.Session {
	out := domain.Session{MediaID: s.MediaID, Name: s.Name}
	if s.ID.Valid {
		out.ID = uuidToString(s.ID)
	}
	if s.StartedAt.Valid {
		out.StartedAt = s.StartedAt.Time
	}
	if s.EndedAt.Valid {
		t := s.EndedAt.Time
		out.EndedAt = &t
	}
	if s.Notes != nil {
		out.Notes = *s.Notes
	}
	return out
}
