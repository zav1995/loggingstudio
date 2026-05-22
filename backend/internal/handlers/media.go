package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
	"github.com/zav1995/loggingstudio/backend/internal/domain"
)

type createMediaRequest struct {
	MediaID     string `json:"media_id"`
	HLSURL      string `json:"hls_url"`
	StartedAtTC string `json:"started_at_tc"`
	FrameRate   *int   `json:"frame_rate"`
	Label       string `json:"label"`
}

// createMedia is POST /media. It's idempotent on matching inputs (200), refuses
// mismatching inputs (409), and otherwise creates the row (201). The re-anchor
// question (PRD §9.5) stays deferred — for now mismatching = refuse.
func (s *Server) createMedia(c *gin.Context) {
	var req createMediaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON", "detail": err.Error()})
		return
	}

	frameRate := 25
	if req.FrameRate != nil {
		frameRate = *req.FrameRate
	}

	m := domain.Media{
		ID:          req.MediaID,
		HLSURL:      req.HLSURL,
		StartedAtTC: req.StartedAtTC,
		FrameRate:   frameRate,
		Label:       req.Label,
	}
	if err := m.Validate(); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "validation failed", "detail": err.Error()})
		return
	}

	existing, err := s.q.GetMedia(c.Request.Context(), req.MediaID)
	switch {
	case err == nil:
		stored := mediaRowToDomain(existing)
		if stored.HLSURL == m.HLSURL && stored.StartedAtTC == m.StartedAtTC && stored.FrameRate == m.FrameRate {
			c.JSON(http.StatusOK, stored)
			return
		}
		c.JSON(http.StatusConflict, gin.H{
			"error":    "media exists with mismatching inputs",
			"stored":   stored,
			"received": m,
		})
		return
	case errors.Is(err, pgx.ErrNoRows):
		// fall through to create
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed", "detail": err.Error()})
		return
	}

	row, err := s.q.CreateMedia(c.Request.Context(), queries.CreateMediaParams{
		ID:          m.ID,
		HlsUrl:      m.HLSURL,
		StartedAtTc: m.StartedAtTC,
		FrameRate:   int32(m.FrameRate),
		Label:       optionalString(m.Label),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create failed", "detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, mediaRowToDomain(row))
}

// getMedia is GET /media/:id.
func (s *Server) getMedia(c *gin.Context) {
	id := c.Param("id")
	row, err := s.q.GetMedia(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "media not found", "id": id})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed", "detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, mediaRowToDomain(row))
}

func mediaRowToDomain(m queries.Media) domain.Media {
	out := domain.Media{
		ID:          m.ID,
		HLSURL:      m.HlsUrl,
		StartedAtTC: m.StartedAtTc,
		FrameRate:   int(m.FrameRate),
	}
	if m.Label != nil {
		out.Label = *m.Label
	}
	if m.CreatedAt.Valid {
		out.CreatedAt = m.CreatedAt.Time
	}
	return out
}

func optionalString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
