package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/zav1995/loggingstudio/backend/internal/db"
	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
	"github.com/zav1995/loggingstudio/backend/internal/events"
	"github.com/zav1995/loggingstudio/backend/internal/handlers"
	"github.com/zav1995/loggingstudio/backend/internal/ingest"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	slog.Info("running migrations")
	if err := db.RunMigrations(dbURL); err != nil {
		slog.Error("migrations failed", "err", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		slog.Error("open pgx pool", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	broker := events.New()

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	handlers.New(pool, broker).Register(r)

	// Watcher runs in its own goroutine and shares the broker so its
	// ingest.processed / ingest.rejected events ride the same SSE stream
	// the HTTP layer publishes log mutations into.
	watcher := &ingest.Watcher{
		Queries:      queries.New(pool),
		Broker:       broker,
		WatchDir:     watchDirFromEnv(),
		PollInterval: 2 * time.Second,
	}
	watcherCtx, cancelWatcher := context.WithCancel(context.Background())
	defer cancelWatcher()
	go func() {
		slog.Info("starting watcher", "dir", watcher.WatchDir)
		if err := watcher.Run(watcherCtx); err != nil && !errors.Is(err, context.Canceled) {
			slog.Error("watcher stopped", "err", err)
		}
	}()

	srv := &http.Server{
		Addr:              ":8080",
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("backend listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	slog.Info("shutting down")
	cancelWatcher()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("graceful shutdown failed", "err", err)
	}
}

func watchDirFromEnv() string {
	if v := os.Getenv("WATCH_DIR"); v != "" {
		return v
	}
	return "/watch"
}
