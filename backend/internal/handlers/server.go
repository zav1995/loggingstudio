// Package handlers wires HTTP routes onto a Server that owns the DB pool
// and the sqlc-generated query layer.
package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
)

// Server is the HTTP layer's dependency container.
type Server struct {
	pool *pgxpool.Pool
	q    *queries.Queries
}

func New(pool *pgxpool.Pool) *Server {
	return &Server{pool: pool, q: queries.New(pool)}
}

// Register attaches all routes onto the given engine.
func (s *Server) Register(r *gin.Engine) {
	r.GET("/health", s.getHealth)

	r.POST("/media", s.createMedia)
	r.GET("/media/:id", s.getMedia)

	r.POST("/tag-groups", s.createTagGroup)
	r.GET("/tag-groups", s.listTagGroups)
	r.GET("/tag-groups/:id", s.getTagGroup)
	r.PATCH("/tag-groups/:id", s.updateTagGroup)
	r.DELETE("/tag-groups/:id", s.deleteTagGroup)

	r.POST("/tags", s.createTag)
	r.GET("/tags", s.listTags)
	r.GET("/tags/:id", s.getTag)
	r.PATCH("/tags/:id", s.updateTag)
	r.DELETE("/tags/:id", s.deleteTag)
}

func (s *Server) getHealth(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	dbStatus := "ok"
	if err := s.pool.Ping(ctx); err != nil {
		dbStatus = err.Error()
	}
	c.JSON(http.StatusOK, gin.H{
		"ok": true,
		"db": dbStatus,
		"ts": time.Now().UTC().Format(time.RFC3339),
	})
}
