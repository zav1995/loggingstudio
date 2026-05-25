package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
)

type rejectedIngestionResponse struct {
	ID         string `json:"id"`
	Filename   string `json:"filename"`
	ParserID   string `json:"parser_id,omitempty"`
	ParserName string `json:"parser_name"`
	MediaID    string `json:"media_id,omitempty"`
	Reason     string `json:"reason"`
	RawPayload string `json:"raw_payload"`
	CreatedAt  string `json:"created_at,omitempty"`
}

func (s *Server) listRejectedIngestions(c *gin.Context) {
	limit := int32(200)
	if q := c.Query("limit"); q != "" {
		if v, err := strconv.Atoi(q); err == nil && v > 0 && v <= 1000 {
			limit = int32(v)
		}
	}
	rows, err := s.q.ListRejectedIngestions(c.Request.Context(), limit)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "list failed", err.Error())
		return
	}
	out := make([]rejectedIngestionResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, rejectedRowToResponse(r))
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) getRejectedIngestion(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	row, err := s.q.GetRejectedIngestion(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "rejected ingestion not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "lookup failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, rejectedRowToResponse(row))
}

func (s *Server) deleteRejectedIngestion(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	if err := s.q.DeleteRejectedIngestion(c.Request.Context(), id); err != nil {
		jsonError(c, http.StatusInternalServerError, "delete failed", err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func rejectedRowToResponse(r queries.RejectedIngestion) rejectedIngestionResponse {
	out := rejectedIngestionResponse{
		Filename:   r.Filename,
		ParserName: r.ParserName,
		Reason:     r.Reason,
		RawPayload: r.RawPayload,
	}
	if r.ID.Valid {
		out.ID = uuidToString(r.ID)
	}
	if r.ParserID.Valid {
		out.ParserID = uuidToString(r.ParserID)
	}
	if r.MediaID != nil {
		out.MediaID = *r.MediaID
	}
	if r.CreatedAt.Valid {
		out.CreatedAt = r.CreatedAt.Time.Format("2006-01-02T15:04:05.000Z")
	}
	return out
}
