package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
	"github.com/zav1995/loggingstudio/backend/internal/domain"
)

type tagGroupRequest struct {
	Name         string `json:"name"`
	Color        string `json:"color"`
	DisplayOrder *int   `json:"display_order"`
}

func (s *Server) createTagGroup(c *gin.Context) {
	var req tagGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}

	g := domain.TagGroup{Name: req.Name, Color: req.Color}
	if req.DisplayOrder != nil {
		g.DisplayOrder = *req.DisplayOrder
	}
	if err := g.Validate(); err != nil {
		jsonError(c, http.StatusUnprocessableEntity, "validation failed", err.Error())
		return
	}

	row, err := s.q.CreateTagGroup(c.Request.Context(), queries.CreateTagGroupParams{
		Name:         g.Name,
		Color:        g.Color,
		DisplayOrder: int32(g.DisplayOrder),
	})
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "create failed", err.Error())
		return
	}
	c.JSON(http.StatusCreated, tagGroupRowToDomain(row))
}

func (s *Server) listTagGroups(c *gin.Context) {
	rows, err := s.q.ListTagGroups(c.Request.Context())
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "list failed", err.Error())
		return
	}
	out := make([]domain.TagGroup, 0, len(rows))
	for _, r := range rows {
		out = append(out, tagGroupRowToDomain(r))
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) getTagGroup(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	row, err := s.q.GetTagGroup(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "tag group not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "lookup failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, tagGroupRowToDomain(row))
}

func (s *Server) updateTagGroup(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	var req struct {
		Name         *string `json:"name,omitempty"`
		Color        *string `json:"color,omitempty"`
		DisplayOrder *int    `json:"display_order,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
		return
	}

	params := queries.UpdateTagGroupParams{ID: id, Name: req.Name, Color: req.Color}
	if req.DisplayOrder != nil {
		v := int32(*req.DisplayOrder)
		params.DisplayOrder = &v
	}

	row, err := s.q.UpdateTagGroup(c.Request.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(c, http.StatusNotFound, "tag group not found", "")
			return
		}
		jsonError(c, http.StatusInternalServerError, "update failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, tagGroupRowToDomain(row))
}

func (s *Server) deleteTagGroup(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid id", err.Error())
		return
	}
	if err := s.q.DeleteTagGroup(c.Request.Context(), id); err != nil {
		jsonError(c, http.StatusInternalServerError, "delete failed", err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func tagGroupRowToDomain(g queries.TagGroup) domain.TagGroup {
	out := domain.TagGroup{
		Name:         g.Name,
		Color:        g.Color,
		DisplayOrder: int(g.DisplayOrder),
	}
	if g.ID.Valid {
		out.ID = uuidToString(g.ID)
	}
	if g.CreatedAt.Valid {
		out.CreatedAt = g.CreatedAt.Time
	}
	return out
}
