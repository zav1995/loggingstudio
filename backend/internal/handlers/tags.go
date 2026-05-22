package handlers

import (
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
	"github.com/zav1995/loggingstudio/backend/internal/domain"
)

type createTagRequest struct {
	GroupID      string  `json:"group_id"`
	Name         string  `json:"name"`
	Hotkey       *string `json:"hotkey,omitempty"`
	DisplayOrder *int    `json:"display_order,omitempty"`
}

func (s *Server) createTag(c *gin.Context) {
	var req createTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}

	t := domain.Tag{GroupID: req.GroupID, Name: req.Name, Hotkey: req.Hotkey}
	if req.DisplayOrder != nil {
		t.DisplayOrder = *req.DisplayOrder
	}
	if err := t.Validate(); err != nil {
		jsonError(c, http.StatusUnprocessableEntity, "validation failed", err.Error())
		return
	}

	groupID, err := parseUUID(t.GroupID)
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid group_id", err.Error())
		return
	}

	row, err := s.q.CreateTag(c.Request.Context(), queries.CreateTagParams{
		GroupID:      groupID,
		Name:         t.Name,
		Hotkey:       t.Hotkey,
		DisplayOrder: int32(t.DisplayOrder),
	})
	if err != nil {
		switch {
		case isUniqueViolation(err):
			jsonError(c, http.StatusConflict, "hotkey already in use", err.Error())
		case isForeignKeyViolation(err):
			jsonError(c, http.StatusUnprocessableEntity, "group_id does not reference an existing tag group", err.Error())
		default:
			jsonError(c, http.StatusInternalServerError, "create failed", err.Error())
		}
		return
	}
	c.JSON(http.StatusCreated, tagRowToDomain(row))
}

func (s *Server) listTags(c *gin.Context) {
	if groupIDStr := c.Query("group_id"); groupIDStr != "" {
		groupID, err := parseUUID(groupIDStr)
		if err != nil {
			jsonError(c, http.StatusBadRequest, "invalid group_id", err.Error())
			return
		}
		rows, err := s.q.ListTagsByGroup(c.Request.Context(), groupID)
		if err != nil {
			jsonError(c, http.StatusInternalServerError, "list failed", err.Error())
			return
		}
		c.JSON(http.StatusOK, tagsToDomain(rows))
		return
	}
	rows, err := s.q.ListTags(c.Request.Context())
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "list failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, tagsToDomain(rows))
}

func (s *Server) getTag(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	row, err := s.q.GetTag(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "tag not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "lookup failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, tagRowToDomain(row))
}

func (s *Server) updateTag(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}

	// Pointer fields distinguish absent from null; for Hotkey, nil means
	// "no change", a pointer to "" means "clear the hotkey", a pointer to a
	// non-empty value means "set to that value".
	var req struct {
		GroupID      *string `json:"group_id,omitempty"`
		Name         *string `json:"name,omitempty"`
		Hotkey       *string `json:"hotkey,omitempty"`
		DisplayOrder *int    `json:"display_order,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}

	params := queries.UpdateTagParams{ID: id, Name: req.Name}
	if req.GroupID != nil {
		gid, err := parseUUID(*req.GroupID)
		if err != nil {
			jsonError(c, http.StatusBadRequest, "invalid group_id", err.Error())
			return
		}
		params.GroupID = gid
	}
	if req.Hotkey != nil {
		hs := true
		params.HotkeySet = &hs
		if *req.Hotkey != "" {
			h := *req.Hotkey
			params.Hotkey = &h
		}
	}
	if req.DisplayOrder != nil {
		v := int32(*req.DisplayOrder)
		params.DisplayOrder = &v
	}

	row, err := s.q.UpdateTag(c.Request.Context(), params)
	if err != nil {
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			jsonError(c, http.StatusNotFound, "tag not found", "")
		case isUniqueViolation(err):
			jsonError(c, http.StatusConflict, "hotkey already in use", err.Error())
		case isForeignKeyViolation(err):
			jsonError(c, http.StatusUnprocessableEntity, "group_id does not reference an existing tag group", err.Error())
		default:
			jsonError(c, http.StatusInternalServerError, "update failed", err.Error())
		}
		return
	}
	c.JSON(http.StatusOK, tagRowToDomain(row))
}

func (s *Server) deleteTag(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	if err := s.q.DeleteTag(c.Request.Context(), id); err != nil {
		jsonError(c, http.StatusInternalServerError, "delete failed", err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func tagRowToDomain(t queries.Tag) domain.Tag {
	out := domain.Tag{
		Name:         t.Name,
		Hotkey:       t.Hotkey,
		DisplayOrder: int(t.DisplayOrder),
	}
	if t.ID.Valid {
		out.ID = uuidToString(t.ID)
	}
	if t.GroupID.Valid {
		out.GroupID = uuidToString(t.GroupID)
	}
	if t.CreatedAt.Valid {
		out.CreatedAt = t.CreatedAt.Time
	}
	return out
}

func tagsToDomain(rows []queries.Tag) []domain.Tag {
	out := make([]domain.Tag, 0, len(rows))
	for _, r := range rows {
		out = append(out, tagRowToDomain(r))
	}
	return out
}

// uuidToString formats a pgtype.UUID as the canonical 8-4-4-4-12 hex string.
func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	b := u.Bytes
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hex.EncodeToString(b[0:4]),
		hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]),
		hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:16]),
	)
}

// avoid unused import warning if pgtype gets pruned by future refactors
var _ = pgtype.UUID{}
