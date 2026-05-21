# PRD — Logging Studio MVP

**Status:** Draft v0.2 (MVP scope)
**Owner:** Xav
**Last updated:** 21 May 2026
**Decision context:** Operated by ScorePlay · standalone SKU · manual + XML ingest only · local-first stack to validate before productizing

---

## 1. Intent

Build the smallest possible Logging Studio that proves the model: humans logging fast, plus XML sources auto-importing into the same store, with a real product UI that already feels good. No multi-user, no permissions, no AI, no real architecture yet. Everything runs locally via `docker compose`. If it works, we re-platform.

---

## 2. Data model

Five entities. SQLite, persisted to a Docker volume.

### 2.1 `Log`

```
id            uuid (primary key)
media_id      string (foreign key to Media.id)
offset_in     integer (milliseconds from media start)
offset_out    integer (milliseconds from media start, nullable for point-in-time logs)
tags          json array of tag ids
source        string ("manual" | "ingest:<parser_name>")
created_at    timestamp
updated_at    timestamp
```

No state machine, no confidence, no description field, no ontology version. Just the five fields above plus timestamps.

### 2.2 `Media`

```
id              string (provided as input to the program — likely a ScorePlay asset id)
hls_url         string (provided as input)
label           string (human-readable, optional, defaults to id)
created_at      timestamp
```

Provided at program start. The program is launched against one media. Multiple media can coexist in the DB across runs.

### 2.3 `Tag` and `TagGroup`

```
TagGroup
  id           uuid
  name         string
  color        string (hex)
  display_order integer

Tag
  id           uuid
  group_id     uuid (foreign key to TagGroup)
  name         string
  hotkey       string (single character or modifier+character, nullable)
  display_order integer
```

Tag groups exist so the UI can visually cluster related tags (e.g., "Shot type" → Forehand / Backhand / Volley; "Score state" → Break point / Game point / Match point). A log can carry tags from multiple groups.

### 2.4 `Session`

```
id            uuid
media_id      string (foreign key to Media)
name          string
started_at    timestamp
ended_at      timestamp (nullable)
notes         text (optional)
```

A Session is a logging context — "RG26 D3 Court 13 morning shift". Logs are not strictly bound to a session (a log belongs to a media), but sessions group logs by working context for filtering and review.

### 2.5 `IngestParser`

```
id            uuid
name          string
source_format string ("xml" | "json")
sample_payload text (the user-uploaded sample, kept for reference)
mapping       json (compiled mapping rules — see §4)
filter        json (compiled filter rules — see §4)
created_at    timestamp
updated_at    timestamp
```

A parser is a saved, named transformation from a foreign payload into our `Log` shape. It runs deterministically without an LLM at execution time. The LLM only runs at configuration time, when the user defines the parser inside the app.

---

## 3. Functional requirements

### 3.1 Program entry

The program is launched with:
- `media_id` (string)
- `hls_url` (string)

On launch:
- If the media doesn't exist in the DB, it's created.
- The UI opens with the player loaded on the HLS stream and the existing logs for that media (if any) on the timeline.

### 3.2 Manual logging

**Video player**
- HLS playback via hls.js.
- SMPTE-style HH:MM:SS:FF timecode display, but internally everything is milliseconds.
- Spacebar play/pause.
- J/K/L shuttle (-2x / pause / +2x).
- Frame step on ← / →.
- 5-second skip on Shift+← / Shift+→.
- Loop region between in/out.

**Hotkey logging**
- Each tag has an optional hotkey.
- Pressing a hotkey opens an in-progress log at the current playhead position with `offset_in = currentMs` and tag pre-attached.
- Pressing `I` sets in-point, `O` sets out-point, `Enter` commits.
- Multi-tag: while a log is in progress, pressing more hotkeys adds tags.
- `Esc` discards the in-progress log.
- "Quick-fire" mode: a single hotkey press immediately creates a 5-second log (configurable per tag — default duration per tag). Useful when working live and you don't want to bother with in/out.

**Tag group + tag definition UI**
- A dedicated "Tags" view inside the app, not a separate config file.
- Add group, name it, pick a color.
- Add tags inside a group, assign a hotkey.
- Hotkey conflicts surfaced immediately (red highlight on duplicate).
- Drag-and-drop to reorder.

**Log editor**
- Click a log on the timeline → jumps the player to its `offset_in` and opens the log editor.
- Editable fields: in, out, tags. Nothing else.
- Tag picker: searchable by name, or click within group, or use hotkey.
- Delete log: trash icon or Backspace when log is selected on timeline.

**Log list**
- Sidebar showing all logs for the current media, sorted by `offset_in`.
- Click a log → jumps player and opens editor (same as clicking timeline).
- Filter by tag, by source, by session.

### 3.3 XML / JSON ingestion

This is the more interesting subsystem.

**Flow**
1. User uploads a sample sidecar file (XML or JSON) into a "Parsers" view.
2. App detects format and renders the structure as an interactive tree.
3. User defines mapping (which fields in the sidecar become which fields in `Log`) and filter (which records to keep). They can either:
   - **Manual mode**: click fields in the tree and drag them to target Log fields. Click an attribute to define a filter rule.
   - **Prompt mode**: type a natural-language description ("for the RG XML, keep only records where UserField with Header=Court equals 'Court 13'; map TC to offset_in, with offset_in = TC ms; map Keywords/Keyword[@Type='Keyword'] to tags, looking up tag by name; source = 'ingest:rg_xml'"). The LLM compiles this into a mapping+filter structure.
4. App shows a preview: "given your sample, this parser would produce N logs, M filtered out". User can step through each predicted log.
5. User names and saves the parser.
6. Parser runs deterministically from this point on — no LLM at runtime.

**Compiled parser shape**
The compiled output is JSON, runs through a small interpreter. Example for the RG XML attached:

```json
{
  "match": "Log",
  "filters": [
    { "path": "UserFields/UserField[Header='Court']/text()", "op": "eq", "value": "Court 13" }
  ],
  "mapping": {
    "offset_in":  { "type": "timecode_to_ms", "path": "TC", "frame_rate": 25, "minus_ms": 5000 },
    "offset_out": { "type": "timecode_to_ms", "path": "TC", "frame_rate": 25, "plus_ms":  2000 },
    "tags":       { "type": "tag_lookup_by_name", "path": "Keywords/Keyword[@Type='Keyword']" },
    "source":     { "type": "literal", "value": "ingest:rg_xml" }
  }
}
```

The interpreter supports a small set of operations:
- `literal` — fixed value
- `xpath` / `jsonpath` — extract from payload
- `timecode_to_ms` — parse SMPTE timecode with frame rate, optional offset
- `tag_lookup_by_name` — resolve tag names to tag ids, creating tags as needed (configurable: strict / lenient)
- `concat`, `lower`, `trim`, `regex_extract` — small string ops

If a sidecar comes in that the compiled parser can't handle (missing field, etc.), the log is rejected with a reason; rejected logs appear in a "Rejected ingestions" view for inspection.

**Watching for new files**
- User configures a "watch folder" path (mounted into the container).
- Each file dropped in the watch folder is matched to a parser (by user-configured rule: filename prefix, content sniffing, or explicit parser assignment per folder).
- File processed → logs created → file moved to `processed/` or `rejected/` subfolder.
- The watch loop polls every 2 seconds. Good enough for "live"; sub-second batching isn't needed at MVP.

**Live behavior**
Live ingestion is just "the watch folder happens to receive files continuously while you're also logging manually". No special live mode. Logs from both sources land in the same table; the UI shows them on the same timeline distinguished by source color.

### 3.4 Re-using the example XML — concrete expected outcome

For the attached file (`LOG_20260518_RG_1T_QD069_..._13_P1_CL_...xml`):

- `Court = "Court 13"` → passes filter (if user configured for Court 13).
- `TC = "17:35:00:08"` at 25fps → 63,300,320ms wall-clock. With `minus_ms: 5000` and `plus_ms: 2000`, the resulting `offset_in / offset_out` are relative to wall-clock, not media start. **This is a real problem** — see §6.1 below for how we resolve it.
- `Keywords/Keyword[@Type='Keyword']` → `["Backhand", "Volley", "Break point", "Game point", "Winner", "Advantage side"]`. These get looked up against existing tags; any missing get created (in a "Imported tags" group).
- One `Log` row inserted, source = `ingest:rg_xml`.

---

## 4. UI / UX

### 4.1 Tech stack

- React + TypeScript.
- **Mantine** as the component library. It looks polished out of the box, has built-in dark mode, has the right primitives (timeline-ish ranges, modals, tree, code editors), and styling is straightforward to override with ScorePlay colors. (Alternatives considered: shadcn/ui — more flexible but more building from primitives; Chakra — slightly less polished; Ant — too corporate.)
- **ScorePlay color tokens** applied as Mantine theme:
  - Primary action: ScorePlay green `#00FF87` (or whatever the canonical brand token is)
  - Background dark: `#0A0A0A`
  - Surface: `#161616`
  - Text primary: `#FAFAFA`
- hls.js for playback.
- Monaco editor for the compiled parser JSON (advanced users).

### 4.2 Views

1. **Studio** (main view, opens on launch)
   - Top: video player with timecode
   - Below player: scrubbable timeline showing all logs as colored bars
   - Right sidebar: log list, filterable
   - Bottom: tag palette (visual hotkey reference)

2. **Tags**
   - Group + tag CRUD, hotkey assignment.

3. **Parsers**
   - List of saved parsers.
   - "New parser" wizard: upload sample → tree view → map/filter → preview → save.
   - Watch folder configuration.

4. **Sessions**
   - List of sessions, create new, mark ended.

5. **Rejected ingestions**
   - Files that didn't parse cleanly, with reason and raw payload.

---

## 5. Architecture (MVP, local-only)

### 5.1 Services

Three containers in `docker-compose.yml`:

- **`db`** — SQLite mounted to a named volume `logging_db_data`. (Or `better-sqlite3` in the backend container with a mounted volume — simpler, no separate service. Recommended: skip the separate db container, use SQLite embedded in the backend, persist via volume.)
- **`backend`** — Node.js + TypeScript + Fastify. Exposes REST + WebSocket. Owns SQLite. Runs the watch folder loop. Volumes: `./watch:/watch`, `./db:/db`.
- **`frontend`** — Vite + React + Mantine. Served as a static build behind a tiny nginx, or just the Vite dev server in dev. Talks to backend on `localhost:8080`.

### 5.2 Backend modules

```
backend/
  src/
    db/                  # SQLite schema + migrations (drizzle or kysely)
    models/              # Log, Media, Tag, TagGroup, Session, IngestParser
    routes/
      logs.ts            # CRUD
      media.ts           # init + lookup
      tags.ts            # CRUD
      sessions.ts        # CRUD
      parsers.ts         # CRUD, test-run, prompt-compile
    ingest/
      watcher.ts         # file watch loop
      interpreter.ts     # runs a compiled parser against a payload
      compiler.ts        # calls LLM to compile prompt → parser JSON
    ws.ts                # WebSocket fanout for ingest events
```

### 5.3 LLM-for-parser-compilation

Only used inside the Parsers view when the user clicks "compile from prompt". One Claude API call. Output: validated JSON conforming to the parser schema. The result is shown to the user before saving so they can edit it if the LLM got it wrong.

Cost is negligible because it's bounded to setup time, not log-time. Per your requirement: no LLM in the runtime path.

### 5.4 Why this stack

- SQLite + Node is the lowest-friction "I want to ship and iterate today" stack.
- Mantine looks good immediately without design work.
- File watcher in Node is trivial (`chokidar`).
- Everything is one `docker compose up` away.

---

## 6. Known issues to resolve before coding

### 6.1 Wall-clock vs media-relative time

The XML provides `TC = 17:35:00:08`, which is broadcast wall-clock, not "milliseconds from start of the HLS stream". The HLS stream's "start" is whenever it started; logs are stored as `offset_in` from media start.

Two options:
- **(a)** Store media start wall-clock when initializing the media (or read from HLS PROGRAM-DATE-TIME tags), then `offset_in = TC - media_start_wallclock`.
- **(b)** Change the schema to store wall-clock timestamps instead of offsets for ingested logs. Less clean.

**Recommendation: (a).** Add `started_at_wallclock` field to `Media`. The program input becomes `media_id + hls_url + started_at_wallclock` (or auto-read from PROGRAM-DATE-TIME). The interpreter's `timecode_to_ms` op converts `TC - started_at_wallclock`.

### 6.2 Frame rate

Implicit in `TC = 17:35:00:08` is "what's the 25th of a second worth in ms?" For RG it's 25fps. We need frame rate either per-media or per-parser. Per-parser is simpler (parsers are sport/source-specific anyway).

### 6.3 Tag auto-creation policy

When an ingested log references a tag name we don't know:
- **Strict**: log is rejected.
- **Lenient**: tag is auto-created in an "Imported / unsorted" group; user can reorganize later.

**Recommendation: lenient by default**, with a setting per parser to flip to strict.

### 6.4 LLM compilation needs guardrails

The LLM compiles to a strict JSON schema. We validate the output (zod or ajv). If the LLM produces invalid JSON we re-prompt once with the validation errors, then fail with a "compile manually" message.

### 6.5 Multiple sidecar files per "match" (out of scope assumption)

The attached XML appears to be one point in a match. A real session would have hundreds of these arriving over the course of a match. That works fine with the current design — each file becomes one log, all under the same media. Just confirming this is the intended behavior.

---

## 7. Out of scope for this MVP (explicit list)

- Multi-user / collaboration / WebSocket sync across users.
- Permissions / auth (the studio runs locally, single user).
- Auto-segmentation engine (the "cut 16h into matches" feature).
- AI logging (transcript or visual).
- Export to FCPXML / AAF / EDL.
- Cloud architecture / Kubernetes / Postgres / Kafka.
- ScorePlay API integration beyond the `media_id` reference.
- Customer-facing UI.

These come back if the MVP validates.

---

## 8. Deliverable

A repo with:

```
logging-studio/
  docker-compose.yml
  backend/
    Dockerfile
    package.json
    src/...
  frontend/
    Dockerfile
    package.json
    src/...
  watch/                 # mounted into backend, drop XMLs here
  db/                    # mounted into backend, SQLite lives here
  README.md
```

`docker compose up` and the studio opens at `localhost:5173`. Pass `media_id` and `hls_url` via env vars in `docker-compose.yml`, or via a launch dialog on first open. Recommend the launch dialog — feels like a product.

---

## 9. Open questions before kickoff

1. **HLS stream source.** For dev, where do we get a test HLS stream? An old RG26 archive? A public test stream? Need this to validate hls.js + frame stepping behavior.
2. **Brand colors.** What's the canonical primary/accent for ScorePlay product UI? (Pulling from brand guide if you want me to commit on it.)
3. **Player position.** The launch input — is `media_id` always a ScorePlay asset id (so we can later push logs back via API), or is it free-form? Doesn't matter for MVP but determines whether we add a "send to ScorePlay" button later.
4. **Watch folder file matching to parsers.** Simplest rule for MVP: one parser per watch folder. Folder `watch/rg_xml/` → RG parser. Folder `watch/stats_perform/` → Stats Perform parser. Confirm this is acceptable vs more sophisticated content sniffing.
5. **Frame rate per media or per parser.** Confirm per-parser is fine for MVP.
