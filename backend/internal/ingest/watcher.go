package ingest

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	queries "github.com/zav1995/loggingstudio/backend/internal/db/generated"
	"github.com/zav1995/loggingstudio/backend/internal/domain"
	"github.com/zav1995/loggingstudio/backend/internal/events"
)

var _ = io.EOF // ensure io stays imported even if we drop direct usage

// Special subfolders inside /watch. We never treat these as parser folders.
const (
	processedDirName = "processed"
	rejectedDirName  = "rejected"
)

const importedTagGroupName = "Imported"
const importedTagGroupColor = "#888888"

// Watcher walks /watch/<parser_name>/<file> on a 2s poll, plus listens to
// fsnotify Create/Write events to react sooner when the host filesystem
// supports them. Each file is processed through the interpreter against
// the parser bound to its subfolder and the active ingest media.
type Watcher struct {
	Queries      *queries.Queries
	Broker       *events.Broker
	WatchDir     string
	PollInterval time.Duration

	// importedGroupOnce + importedGroupID lazily resolve the "Imported"
	// TagGroup the first time a lenient unknown-tag lookup needs it.
	importedGroupOnce sync.Once
	importedGroupID   pgtype.UUID
	importedGroupErr  error
}

// Run blocks until ctx is cancelled. Errors during a single file's processing
// are logged and skipped; we don't want one bad sidecar to stop the loop.
func (w *Watcher) Run(ctx context.Context) error {
	if w.WatchDir == "" {
		w.WatchDir = "/watch"
	}
	if w.PollInterval <= 0 {
		w.PollInterval = 2 * time.Second
	}
	if err := w.ensureDirs(); err != nil {
		return fmt.Errorf("ensure watch dirs: %w", err)
	}

	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		// fsnotify unavailable shouldn't be fatal — we still have the poll.
		slog.Warn("fsnotify unavailable, falling back to poll-only", "err", err)
	} else {
		defer fsw.Close()
		// Watch the root + every existing subfolder. New subfolders are
		// picked up by the next Create event on the root.
		_ = fsw.Add(w.WatchDir)
		if entries, err := os.ReadDir(w.WatchDir); err == nil {
			for _, e := range entries {
				if e.IsDir() && !isReservedDir(e.Name()) {
					_ = fsw.Add(filepath.Join(w.WatchDir, e.Name()))
				}
			}
		}
	}

	ticker := time.NewTicker(w.PollInterval)
	defer ticker.Stop()

	// One scan immediately so we don't wait for the first tick.
	w.scan(ctx)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			w.scan(ctx)
		case evt, ok := <-eventsChan(fsw):
			if !ok {
				continue
			}
			if evt.Op&(fsnotify.Create|fsnotify.Write) == 0 {
				continue
			}
			// If a new directory got created under /watch, start watching it.
			if info, err := os.Stat(evt.Name); err == nil && info.IsDir() {
				if !isReservedDir(filepath.Base(evt.Name)) {
					_ = fsw.Add(evt.Name)
				}
				continue
			}
			w.scan(ctx)
		}
	}
}

func eventsChan(w *fsnotify.Watcher) <-chan fsnotify.Event {
	if w == nil {
		// nil channel never fires; the ticker handles everything.
		return nil
	}
	return w.Events
}

func (w *Watcher) ensureDirs() error {
	for _, name := range []string{processedDirName, rejectedDirName} {
		if err := os.MkdirAll(filepath.Join(w.WatchDir, name), 0o755); err != nil {
			return err
		}
	}
	return nil
}

func isReservedDir(name string) bool {
	return name == processedDirName || name == rejectedDirName
}

// scan walks /watch/*/* and processes each file. Errors per-file are logged
// and don't abort the sweep.
func (w *Watcher) scan(ctx context.Context) {
	entries, err := os.ReadDir(w.WatchDir)
	if err != nil {
		slog.Error("read watch dir", "err", err)
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() || isReservedDir(entry.Name()) {
			continue
		}
		parserName := entry.Name()
		sub := filepath.Join(w.WatchDir, parserName)
		files, err := os.ReadDir(sub)
		if err != nil {
			slog.Error("read subfolder", "dir", sub, "err", err)
			continue
		}
		for _, f := range files {
			if f.IsDir() || strings.HasPrefix(f.Name(), ".") {
				continue
			}
			path := filepath.Join(sub, f.Name())
			w.processOne(ctx, path, parserName)
		}
	}
}

func (w *Watcher) processOne(ctx context.Context, path, parserName string) {
	payload, err := os.ReadFile(path)
	if err != nil {
		slog.Error("read sidecar", "path", path, "err", err)
		return
	}

	parserRow, err := w.Queries.GetParserByName(ctx, parserName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.reject(ctx, path, "", parserName, "", payload,
				fmt.Sprintf("no parser registered for folder %q", parserName))
		} else {
			slog.Error("lookup parser", "name", parserName, "err", err)
		}
		return
	}

	mediaRow, err := w.resolveMedia(ctx)
	if err != nil {
		parserIDStr := ""
		if parserRow.ID.Valid {
			parserIDStr = uuidString(parserRow.ID)
		}
		w.reject(ctx, path, parserIDStr, parserRow.Name, "", payload,
			fmt.Sprintf("no active media to attach logs to: %v", err))
		return
	}

	parser, err := assembleParser(parserRow.Mapping, parserRow.Filter)
	if err != nil {
		parserIDStr := uuidString(parserRow.ID)
		w.reject(ctx, path, parserIDStr, parserRow.Name, mediaRow.ID, payload,
			fmt.Sprintf("parser decode: %v", err))
		return
	}

	res, err := Process(parser, payload, parserRow.SourceFormat, Context{
		Media:       &mediaRow,
		TagResolver: w.tagResolver(ctx),
	})
	if err != nil {
		parserIDStr := uuidString(parserRow.ID)
		w.reject(ctx, path, parserIDStr, parserRow.Name, mediaRow.ID, payload,
			fmt.Sprintf("interpreter: %v", err))
		return
	}
	if res.Reject != "" {
		parserIDStr := uuidString(parserRow.ID)
		w.reject(ctx, path, parserIDStr, parserRow.Name, mediaRow.ID, payload, res.Reject)
		return
	}

	// Success: persist the log + move file + emit event.
	tagsJSON, err := json.Marshal(res.Log.Tags)
	if err != nil {
		parserIDStr := uuidString(parserRow.ID)
		w.reject(ctx, path, parserIDStr, parserRow.Name, mediaRow.ID, payload,
			fmt.Sprintf("encode tags: %v", err))
		return
	}
	row, err := w.Queries.CreateLog(ctx, queries.CreateLogParams{
		MediaID:   res.Log.MediaID,
		OffsetIn:  res.Log.OffsetIn,
		OffsetOut: res.Log.OffsetOut,
		Tags:      tagsJSON,
		Source:    res.Log.Source,
	})
	if err != nil {
		parserIDStr := uuidString(parserRow.ID)
		w.reject(ctx, path, parserIDStr, parserRow.Name, mediaRow.ID, payload,
			fmt.Sprintf("persist log: %v", err))
		return
	}

	dest, err := w.moveTo(path, processedDirName)
	if err != nil {
		slog.Error("move processed", "path", path, "err", err)
	}
	w.Broker.Publish(events.Event{
		Type: "ingest.processed",
		Payload: map[string]any{
			"file":      filepath.Base(path),
			"moved_to":  dest,
			"parser":    parserRow.Name,
			"media_id":  res.Log.MediaID,
			"log_id":    uuidString(row.ID),
			"offset_in": res.Log.OffsetIn,
		},
	})
}

func (w *Watcher) reject(
	ctx context.Context,
	path, parserID, parserName, mediaID string,
	payload []byte,
	reason string,
) {
	params := queries.CreateRejectedIngestionParams{
		Filename:    filepath.Base(path),
		ParserName:  parserName,
		Reason:      reason,
		RawPayload:  string(payload),
	}
	if parserID != "" {
		var pid pgtype.UUID
		if err := pid.Scan(parserID); err == nil {
			params.ParserID = pid
		}
	}
	if mediaID != "" {
		m := mediaID
		params.MediaID = &m
	}
	row, err := w.Queries.CreateRejectedIngestion(ctx, params)
	if err != nil {
		slog.Error("persist rejected ingestion", "file", path, "err", err)
	}

	dest, mvErr := w.moveTo(path, rejectedDirName)
	if mvErr != nil {
		slog.Error("move rejected", "path", path, "err", mvErr)
	}

	payloadEvt := map[string]any{
		"file":     filepath.Base(path),
		"moved_to": dest,
		"parser":   parserName,
		"reason":   reason,
	}
	if row.ID.Valid {
		payloadEvt["rejected_id"] = uuidString(row.ID)
	}
	w.Broker.Publish(events.Event{Type: "ingest.rejected", Payload: payloadEvt})
}

// moveTo moves the file into /watch/<bucket>/, appending a timestamp on name
// collision so we never overwrite history.
func (w *Watcher) moveTo(src, bucket string) (string, error) {
	name := filepath.Base(src)
	dst := filepath.Join(w.WatchDir, bucket, name)
	if _, err := os.Stat(dst); err == nil {
		ext := filepath.Ext(name)
		base := strings.TrimSuffix(name, ext)
		dst = filepath.Join(w.WatchDir, bucket,
			fmt.Sprintf("%s-%d%s", base, time.Now().UnixNano(), ext))
	}
	if err := os.Rename(src, dst); err != nil {
		return "", err
	}
	return dst, nil
}

// resolveMedia picks the media all ingested logs attach to. INGEST_MEDIA_ID
// env wins; otherwise we fall back to the most recently created media (the
// MVP single-active-media assumption from PRD §3.1).
func (w *Watcher) resolveMedia(ctx context.Context) (domain.Media, error) {
	if id := os.Getenv("INGEST_MEDIA_ID"); id != "" {
		row, err := w.Queries.GetMedia(ctx, id)
		if err != nil {
			return domain.Media{}, fmt.Errorf("INGEST_MEDIA_ID=%q not found: %w", id, err)
		}
		return mediaFromRow(row), nil
	}
	rows, err := w.Queries.ListMedia(ctx)
	if err != nil {
		return domain.Media{}, err
	}
	if len(rows) == 0 {
		return domain.Media{}, errors.New("no media in DB")
	}
	return mediaFromRow(rows[0]), nil
}

// tagResolver looks up a tag by name; in lenient mode it creates the tag
// inside the "Imported" group on first miss (cached for the watcher's
// lifetime).
func (w *Watcher) tagResolver(ctx context.Context) TagResolver {
	return func(name, mode string) (string, error) {
		tag, err := w.Queries.GetTagByName(ctx, name)
		if err == nil {
			return uuidString(tag.ID), nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", err
		}
		if mode == "strict" {
			return "", ErrUnknownTag
		}

		groupID, err := w.importedGroup(ctx)
		if err != nil {
			return "", err
		}
		created, err := w.Queries.CreateTag(ctx, queries.CreateTagParams{
			GroupID:      groupID,
			Name:         name,
			DisplayOrder: 0,
		})
		if err != nil {
			// Lost a race? Re-lookup and use the existing row.
			tag, lookupErr := w.Queries.GetTagByName(ctx, name)
			if lookupErr == nil {
				return uuidString(tag.ID), nil
			}
			return "", err
		}
		return uuidString(created.ID), nil
	}
}

func (w *Watcher) importedGroup(ctx context.Context) (pgtype.UUID, error) {
	w.importedGroupOnce.Do(func() {
		row, err := w.Queries.GetTagGroupByName(ctx, importedTagGroupName)
		if err == nil {
			w.importedGroupID = row.ID
			return
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			w.importedGroupErr = err
			return
		}
		created, err := w.Queries.CreateTagGroup(ctx, queries.CreateTagGroupParams{
			Name:         importedTagGroupName,
			Color:        importedTagGroupColor,
			DisplayOrder: 999,
		})
		if err != nil {
			w.importedGroupErr = err
			return
		}
		w.importedGroupID = created.ID
	})
	return w.importedGroupID, w.importedGroupErr
}

func assembleParser(mapping, filter json.RawMessage) (*Parser, error) {
	var m Mapping
	if err := json.Unmarshal(mapping, &m); err != nil {
		return nil, fmt.Errorf("mapping: %w", err)
	}
	var filters []FilterRule
	if len(filter) > 0 {
		if err := json.Unmarshal(filter, &filters); err != nil {
			return nil, fmt.Errorf("filter: %w", err)
		}
	}
	return &Parser{
		Match:         "Log",
		Filters:       filters,
		Mapping:       m,
		TagLookupMode: "lenient",
	}, nil
}

func mediaFromRow(m queries.Media) domain.Media {
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

// uuidString is a local copy of the formatter in handlers/util.go — kept here
// to avoid an internal/handlers ↔ internal/ingest cycle.
func uuidString(u pgtype.UUID) string {
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
