# Convoy Plan — Logging Studio MVP

**Status:** Proposed v1.0
**Owner:** Xav
**Last updated:** 21 May 2026
**Source documents:** [`docs/PRD.md`](PRD.md) v0.4 · [`../AGENTS.md`](../AGENTS.md) (pending v0.2 update)

Six convoys, 4–6 beads each, ~31 beads total. Each bead is one focused PR (200–800 lines, individually testable, individually mergeable). Convoys ship one at a time; later convoys assume earlier ones have landed on `main`.

Bead IDs use convoy.position notation (e.g., 2.3). Final `bd` IDs are assigned at creation.

---

## Convoy 1 — Skeleton

**Goal:** prove the chosen stack plumbing works end-to-end with nothing on top of it.

**Demo:** `docker compose up --build` brings up postgres + backend + frontend. Open `http://localhost:5173` and see a ScorePlay-green dark-themed page that fetches `/health` from the backend and renders the status.

**Decision surfaced:** is the Go/Gin/pgx/Postgres + Vite/React/Mantine plumbing actually nice to work with at the seams? This is the only moment cheap enough to course-correct before code piles on top.

**Beads:**
| # | Title | One-liner |
|---|---|---|
| 1.1 | Root scaffolding | Repo `README`, `.gitignore`, `.editorconfig`, placeholder `shared/parser-schema.json`, top-level tooling files. |
| 1.2 | Backend skeleton | Go module + Gin boot + `slog` + `GET /health` + multi-stage Dockerfile + `internal/db/sqlc.yaml` placeholder. |
| 1.3 | Frontend skeleton + theme | Vite + React 18 + Mantine v7, ScorePlay theme tokens (AGENTS §5), `defaultColorScheme: 'dark'`, landing page that calls `/health` via a typed fetch wrapper, Dockerfile. |
| 1.4 | Compose + wiring | `docker-compose.yml` with three services (postgres, backend, frontend), `./pgdata` + `./watch` bind mounts, healthchecks, `DATABASE_URL`, CORS, README "Run it" section. |

**Dependencies:** 1.1 → {1.2, 1.3} → 1.4

---

## Convoy 2 — Data foundation + Tags configuration

**Goal:** stand up the full schema in Postgres and ship the first end-to-end feature slice (DB → API → UI).

**Demo:** open the app, navigate to **Tags**, create tag groups with colors, add tags with hotkeys, see live duplicate-hotkey highlighting, drag-and-drop to reorder. Restart the stack; data persists.

**Decision surfaced:** does the data model and the tag configuration workflow feel right? This is the smallest credible end-to-end slice and surfaces shape problems cheaply before any logging UI rests on it.

**Beads:**
| # | Title | One-liner |
|---|---|---|
| 2.1 | Schema + migrations + sqlc setup | `golang-migrate` SQL migrations for all 5 entities (including `Media.started_at_tc` text + `Media.frame_rate` int, default 25), `sqlc.yaml` + generated queries committed, pgx pool wiring, domain structs in `internal/domain/`. |
| 2.2 | Tags + TagGroups handlers | Gin CRUD for both, hotkey-conflict detection on write, `display_order` reorder endpoint, `go-playground/validator` at boundary. |
| 2.3 | App shell + routing + TanStack Query | `react-router-dom`, Mantine AppShell with sidebar (Studio / Tags / Parsers / Sessions / Rejected), QueryClient setup, error toaster, typed API client wrappers. |
| 2.4 | TagGroups CRUD UI | Group create / rename / recolor / reorder / delete using `@mantine/form` and a color input. |
| 2.5 | Tags CRUD UI | Tags within groups: name, hotkey input with live conflict highlight, reorder, delete. |

**Dependencies:** Convoy 1 complete → 2.1 → 2.2 → {2.3 (parallel with 2.2 OK), 2.4 needs 2.2+2.3} → 2.5

---

## Convoy 3 — Studio view + manual logging

**Goal:** the central UX bet of the product — fast, keyboard-driven manual logging on top of HLS video.

**Demo:** launch the app with a `media_id` + `hls_url` + `started_at_tc` + `frame_rate`. The HLS stream loads. Press hotkeys to create logs at the playhead, see them appear on the scrubbable timeline and in the sidebar list. Click a log → player jumps and editor opens; edit in/out/tags; delete. Restart the stack — logs persist.

**Decision surfaced:** does keyboard-driven logging actually feel fast enough for a logger in a broadcast room? This is *the* product bet. If this isn't tight, nothing else matters.

**Beads:**
| # | Title | One-liner |
|---|---|---|
| 3.1 | Logs + Media handlers | Gin CRUD for both. Media init validates SMPTE format of `started_at_tc`. Logs filterable by media/tag/source, sorted by `offset_in`. |
| 3.2 | Launch dialog | First-open modal capturing **four** inputs (`media_id`, `hls_url`, `started_at_tc` SMPTE-masked, `frame_rate` default 25); env-var fallback; POSTs to media init. |
| 3.3 | hls.js player | Playback, spacebar play/pause, J/K/L shuttle, frame step (←/→), 5s skip (Shift+←/→), loop region, SMPTE↔ms conversion at edges. |
| 3.4 | Timeline + log list sidebar | Scrubbable strip with colored log bars (color by tag group); sortable filterable sidebar list; click-to-seek from either. |
| 3.5 | Hotkey logging engine | Keyboard handler with in-progress log state machine: hotkey → in-progress at playhead → I/O adjust → Enter commit / Esc discard. Multi-tag while in-progress. **No quick-fire.** |
| 3.6 | Log editor | Click-to-edit panel for in/out/tags; delete via trash icon or Backspace when log is selected on timeline. |

**Dependencies:** Convoy 2 complete → 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6

**Open decisions referenced (escalate if hit):**
- AGENTS §10 #1 — test HLS stream source (blocks 3.3 demo).

---

## Convoy 4 — Ingestion engine (backend)

**Goal:** ship the deterministic compiled-parser interpreter and the watch-folder loop that feeds it.

**Demo:** seed a parser definition via API (or a fixture script). Drop `sample-data/rg-point.xml` into `watch/`. Backend picks it up, the parser's `filters` claim the file (Court == "Court 13"), the interpreter produces a Log row matching PRD §3.4 (`offset_in = 295,320`, `offset_out = 302,320`), and the file moves to `processed/`. Drop a malformed file → lands in `rejected/` with reason, surfaces in a rejected-ingestions record. Since Convoy 3 already shipped the timeline, the new log appears live via SSE.

**Decision surfaced:** does the compiled-parser + deterministic-interpreter abstraction actually capture real-world variation? This is the architectural bet on "compile once with LLM, run many without."

**Beads:**
| # | Title | One-liner |
|---|---|---|
| 4.1 | Canonical ParserSchema | Write `shared/parser-schema.json` (JSON Schema, source of truth per AGENTS §7), Go validator in `internal/validation/`, TS Zod mirror at `frontend/src/lib/parser-schema.ts`. |
| 4.2 | Parser interpreter | Go implementation of all ops (literal, xpath, jsonpath, timecode_to_ms, tag_lookup_by_name, concat/lower/trim/regex_extract). XPath via `antchfx/xmlquery`. BOM-tolerant XML. Reads `frame_rate` + `started_at_tc` from `Media` at runtime. Tests against `sample-data/rg-point.xml` for the §3.4 numbers. |
| 4.3 | Parsers CRUD + test-run + rejections listing | Gin handlers: CRUD, `POST /parsers/:id/test-run` (payload → predicted logs), `GET /rejected-ingestions`. |
| 4.4 | LLM parser-compile endpoint | `POST /parsers/compile` calls Anthropic via `anthropic-sdk-go`, validates output against the JSON Schema, single re-prompt on invalid, returns compiled parser JSON. |
| 4.5 | Watch folder loop | `fsnotify` on `/watch`. For each new file: walk parsers by `created_at` ascending, run each parser's `filters` against the parsed payload, first match claims the file. Mapping runs; logs are persisted; file moves to `processed/`. Unmatched/invalid files move to `rejected/` with reason. |
| 4.6 | SSE ingest events + frontend hook | Gin SSE endpoint emitting `log.created` + `ingest.rejected`. Frontend hook subscribes and animates new logs onto the Studio timeline. |

**Dependencies:** Convoy 3 complete → 4.1 → 4.2 → {4.3, 4.4} → 4.5 → 4.6

---

## Convoy 5 — Parsers UI

**Goal:** make parser authoring usable by a non-engineer.

**Demo:** open the Parsers view, upload `rg-point.xml`. Tree view renders. Either drag tree paths into Log field slots (manual mode), or type a prompt and have Claude compile it (prompt mode). Preview the predicted logs against the sample, step through them, save. Configure the watch-folder for the parser. Drop a fresh file into the folder and watch it ingest live in Studio.

**Decision surfaced:** is parser authoring actually doable by non-engineers? Pick a side: tree-clicking, prompt-driven, or both?

**Beads:**
| # | Title | One-liner |
|---|---|---|
| 5.1 | Sample upload + payload tree view | Drag/drop XML or JSON, render as interactive tree with click-to-select-path. |
| 5.2 | Manual mapping mode | Drag tree paths into Log field slots (offset_in, offset_out, tags, source); filter rule editor. Highest LOC risk — split into binding + filter UI if exceeding 800. |
| 5.3 | Prompt mode (frontend) | Prompt textarea, "Compile" button calls `POST /parsers/compile`, render returned JSON for user review/edit before save. |
| 5.4 | Compile preview pane | Runs `POST /parsers/:id/test-run` against the sample, displays "M filtered / N produced", lets user step through predicted logs. |
| 5.5 | Monaco editor + watch-folder config UI | Monaco view of compiled parser JSON (validates on save against the Zod mirror); UI to set the watch-folder binding per parser. |

**Dependencies:** Convoy 4 complete → 5.1 → {5.2, 5.3} → 5.4 → 5.5

---

## Convoy 6 — Sessions + closing

**Goal:** add session context to logs and prove the whole MVP hangs together as one product.

**Demo:** full end-to-end smoke. Start the app on a media, create a Session ("RG D3 Court 13"), define hotkey tags, drop sample XML into the right watch folder, log some events manually, end the session, filter the log list by session window. Run the smoke script and have it pass.

**Decision surfaced:** does the whole MVP hang together as one product, or are there obvious gaps before declaring it shippable?

**Beads:**
| # | Title | One-liner |
|---|---|---|
| 6.1 | Sessions handlers | Gin CRUD + "end session" endpoint. |
| 6.2 | Sessions UI | List, create, end, notes; "active session" indicator in the app shell. |
| 6.3 | Session-window filter on logs | Server-side filter `created_at ∈ [started_at, ended_at]`; sidebar filter chip. |
| 6.4 | E2E smoke script | Scripted `docker compose up` → wait for healthchecks → seed parser → drop `sample-data/rg-point.xml` → assert one Log row exists with the expected `offset_in / offset_out`. |

**Dependencies:** Convoy 5 complete → 6.1 → {6.2, 6.3} → 6.4

---

## Open decisions tracked across convoys

These are listed in AGENTS.md §10. If a bead hits one, escalate via `gt escalate` rather than inventing an answer.

| Ref | Question | Blocks |
|---|---|---|
| AGENTS §10 #1 / PRD §9 Q1 | Test HLS stream source for dev | 3.3 demo |
| AGENTS §10 #2 / PRD §9 Q3 | `media_id` validation against ScorePlay vs free-form | 3.1 (current default: free-form for MVP) |
| AGENTS §10 #3 / PRD §9 Q2 | Brand colors final confirmation | none (current tokens in AGENTS §5 assumed correct) |

---

## Sizing summary

| Convoy | Beads | Est. lines | Ships as |
|---|---|---|---|
| 1 | 4 | ~1,000 | Working skeleton |
| 2 | 5 | ~1,800 | Tag configuration UI, data persistence |
| 3 | 6 | ~2,600 | Manual logging product |
| 4 | 6 | ~2,500 | Ingestion engine + live updates |
| 5 | 5 | ~2,200 | Parser authoring UI |
| 6 | 4 | ~1,100 | Sessions + closing |
| **Total** | **30** | **~11,200** | MVP |
