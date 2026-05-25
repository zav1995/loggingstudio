package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/zav1995/loggingstudio/backend/internal/events"
)

// publishPickerMessage accepts a JSON payload at
//
//	POST /picker-sessions/:id/messages
//
// and republishes it into the session's broker. We deliberately do not
// validate the payload shape — the picker protocol is owned by the frontend
// and may evolve without the backend caring.
func (s *Server) publishPickerMessage(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		jsonError(c, http.StatusBadRequest, "session id is required", "")
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		jsonError(c, http.StatusBadRequest, "read body", err.Error())
		return
	}
	var payload any
	if len(body) > 0 {
		if err := json.Unmarshal(body, &payload); err != nil {
			jsonError(c, http.StatusBadRequest, "invalid JSON", err.Error())
			return
		}
	}
	s.pickerRelay.Get(id).Publish(events.Event{
		Type:    "picker.message",
		Payload: payload,
	})
	c.Status(http.StatusNoContent)
}

// streamPickerMessages opens an SSE stream of every message published to
// the session at
//
//	GET /picker-sessions/:id/stream
//
// Mirrors the existing /events stream — heartbeat ping every 15s, the
// X-Accel-Buffering: no header keeps nginx from pooling the bytes.
func (s *Server) streamPickerMessages(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		jsonError(c, http.StatusBadRequest, "session id is required", "")
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.String(http.StatusInternalServerError, "streaming unsupported")
		return
	}
	c.Writer.WriteHeader(http.StatusOK)
	flusher.Flush()

	broker := s.pickerRelay.Get(id)
	ch, unsub := broker.Subscribe()
	defer unsub()

	ticker := time.NewTicker(sseHeartbeatInterval)
	defer ticker.Stop()

	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case evt, open := <-ch:
			if !open {
				return
			}
			data, err := json.Marshal(evt.Payload)
			if err != nil {
				continue
			}
			if _, err := fmt.Fprintf(c.Writer, "data: %s\n\n", data); err != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			if _, err := io.WriteString(c.Writer, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
