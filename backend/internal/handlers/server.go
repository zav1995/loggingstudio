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
	"github.com/zav1995/loggingstudio/backend/internal/events"
	"github.com/zav1995/loggingstudio/backend/internal/picker"
)

// Server is the HTTP layer's dependency container.
type Server struct {
	pool        *pgxpool.Pool
	q           *queries.Queries
	broker      *events.Broker
	pickerRelay *picker.Relay
}

func New(pool *pgxpool.Pool, broker *events.Broker, pickerRelay *picker.Relay) *Server {
	return &Server{
		pool:        pool,
		q:           queries.New(pool),
		broker:      broker,
		pickerRelay: pickerRelay,
	}
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

	r.POST("/sessions", s.createSession)
	r.GET("/sessions", s.listSessions)
	r.GET("/sessions/:id", s.getSession)
	r.PATCH("/sessions/:id", s.updateSession)
	r.DELETE("/sessions/:id", s.deleteSession)

	r.POST("/logs", s.createLog)
	r.GET("/logs", s.listLogs)
	r.GET("/logs/:id", s.getLog)
	r.PATCH("/logs/:id", s.updateLog)
	r.DELETE("/logs/:id", s.deleteLog)

	r.POST("/parsers", s.createParser)
	r.GET("/parsers", s.listParsers)
	r.GET("/parsers/:id", s.getParser)
	r.PATCH("/parsers/:id", s.updateParser)
	r.DELETE("/parsers/:id", s.deleteParser)
	r.POST("/parsers/:id/test", s.testParser)

	r.GET("/rejected-ingestions", s.listRejectedIngestions)
	r.GET("/rejected-ingestions/:id", s.getRejectedIngestion)
	r.DELETE("/rejected-ingestions/:id", s.deleteRejectedIngestion)

	r.GET("/events", s.sseEvents)

	r.POST("/picker-sessions/:id/messages", s.publishPickerMessage)
	r.GET("/picker-sessions/:id/stream", s.streamPickerMessages)
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
