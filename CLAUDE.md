# CLAUDE.md — Logging Studio

This file is the operating manual for Claude Code in this repo. Read it in full at the start of every session, then read `docs/PRD.md` before doing any work.

---

## 0. How we work — read this carefully

Xav does not want to manage Beads manually. He speaks in natural language. **You handle all Beads bookkeeping behind the scenes**, surfacing it only when it matters.

### Your standing responsibilities

At the **start of every session**, without being asked:

1. Run `bd ready` to see what's actionable.
2. Run `bd list --status in_progress` to detect any issue left open from a previous session.
3. Run `bd list --status closed --limit 5` to remind yourself (and Xav) what shipped recently.
4. **Open the session** with a 2-4 line summary: "Last session you closed X. Currently in-progress: Y (if any). Ready to work: Z." Then ask what Xav wants to do, or propose the next logical step.

During the session, **autonomously**:

5. When you and Xav agree on what to work on, mark the issue `in_progress` before starting. If no issue exists for what's being discussed, create one *first*, then mark it in_progress.
6. As work surfaces sub-tasks, follow-ups, or "we should also do X later" thoughts, create Beads issues for them silently. Mention them briefly ("logged a follow-up to add tracing later") but don't ask permission for routine bookkeeping.
7. When work is done and verified, commit the code, then close the issue with a one-line summary in the notes. Do not ask "should I close the issue?" — just close it.
8. If an issue's scope grows mid-work to something a separate PR should own, stop, create the spillover issue, and ask Xav whether to continue the current one as-is or refocus.
9. If Xav says "let's also add X" mid-session and X is small enough to fold in, fold it in and append to the issue's acceptance criteria via `bd update`. If X is its own PR, create a new issue and block it appropriately.

At the **end of every session** (Xav says "let's stop", "good for today", "I'll come back later", or similar):

10. Show a brief recap: what was closed this session, what's still in_progress (and why), what's next.
11. If anything is left `in_progress`, either close it (if work is genuinely done) or revert it to `open` with a note explaining where you stopped — never leave issues `in_progress` across sessions.
12. Commit any uncommitted Beads state changes (`git add .beads/ && git commit -m "tasks: ..."`).

### What Xav should never have to do

- Run `bd` commands himself (unless he wants to).
- Tell you to mark something in_progress, or closed.
- Ask "what's next?" — you should be one step ahead.
- Remember which issue corresponds to the work in front of him.

### What Xav still owns

- Reviewing diffs before commits.
- Approving or rejecting your proposed approach before you write code.
- Deciding what to work on next when there's ambiguity.
- Saying yes/no to scope changes.

### The principle

You are the project's task manager. Xav is the project's owner. He talks; you track. The Beads DB is your responsibility to keep coherent. He should be able to ask "where are we?" at any moment and get a real answer pulled from Beads, not from your conversational memory.

---

## 1. What this project is

Local-first MVP of ScorePlay's **Logging Studio** — a tool for adding timecoded logs (in/out points + tags) to video. Two ways to create logs:

1. **Manual logging** — a human watches video and presses hotkeys to mark events.
2. **Sidecar ingestion** — XML/JSON files dropped into a watch folder are parsed into logs by user-defined parsers (compiled once via LLM, then run deterministically without an LLM at runtime).

Runs entirely on the developer's machine via `docker compose up`. No cloud, no auth, no multi-user.

Full spec: `docs/PRD.md`. Always read it before non-trivial work.

---

## 2. Stack — non-negotiable

Do not change these without explicit confirmation from Xav.

| Layer | Choice | Notes |
|---|---|---|
| Backend language | **Go 1.22+** | golangci-lint must pass |
| Backend framework | **Gin** | github.com/gin-gonic/gin |
| Database | **Postgres 16 + pgvector** | Containerized, volume-mounted |
| DB driver | **pgx/v5** | with pgxpool |
| Query layer | **sqlc** | SQL in `internal/db/queries/`, generated code committed |
| Migrations | **golang-migrate** | Files in `internal/db/migrations/` |
| Validation | **go-playground/validator** | Struct tags |
| File watcher | **fsnotify** | github.com/fsnotify/fsnotify |
| LLM client | **anthropic-sdk-go** | Used at parser-compile time only |
| Frontend build | **Vite** | |
| Frontend framework | **React 18 + TypeScript** | Strict mode |
| Component library | **Mantine v7** | Dark theme by default |
| Video playback | **hls.js** | |
| Cross-stack types | **JSON Schema at `shared/parser-schema.json`** | Source of truth for Go and TS |
| Container orchestration | **docker compose** | Three services: `postgres`, `backend`, `frontend` |

---

## 3. Beads — your reference commands

You handle these. Xav does not.

```bash
bd ready                            # session-start: what's actionable
bd list                             # everything open
bd list --status in_progress        # what's mid-flight
bd list --status closed --limit N   # recent history
bd show <id>                        # full detail on one issue
bd create --file <path>             # new issue from markdown file (first line = title)
bd update <id> --status in_progress
bd update <id> --status open
bd update <id> --status closed --notes "one-line summary of what shipped"
bd update <id> --description "..."  # edit acceptance criteria as scope clarifies
bd block <id> --on <other-id>       # mark dependency
bd unblock <id> --on <other-id>     # remove dependency
bd edit <id>                        # interactive edit if needed
```

**Issue file conventions** (when creating via `--file`):

```
<Title — short imperative>

## Goal
What this issue ships, in 1-2 sentences.

## Acceptance criteria
- Concrete, checkable things
- Each one verifiable without ambiguity

## Verification
The exact command(s) that prove this is done.
```

Always include a verification section. For anything past the skeleton, the canonical verification line is "`docker compose up --build` brings the stack up cleanly with no errors."

**Commit `.beads/` whenever you change it.** Use `tasks:` prefix:
```
tasks: log follow-up for SSE reconnection logic
tasks: close root scaffolding (#abc12)
```

---

## 4. Repo layout (target — built up over time)

```
loggingstudio/
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── .beads/                         # tracker DB, committed
├── docs/
│   └── PRD.md
├── shared/
│   └── parser-schema.json
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   ├── go.sum
│   ├── cmd/server/main.go
│   └── internal/
│       ├── db/{migrations,queries,generated}/
│       ├── domain/
│       ├── handlers/
│       ├── ingest/
│       └── validation/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   └── src/{api,routes,components}/
├── watch/
├── pgdata/
└── sample-data/
    └── rg-point.xml
```

Don't pre-create empty directories. They appear as actual code lands.

---

## 5. Coding conventions

- **No premature abstraction.** Write something twice before extracting it.
- **All API inputs validated** at the handler boundary. No exceptions.
- **All times in milliseconds internally.** SMPTE timecode is a display format only.
- **IDs are UUIDs (v4)** for everything except Media (where `id` is the externally-supplied ScorePlay asset id).
- **No `console.log` or `fmt.Println` in committed code.** Use a logger (slog on backend).
- **Backend Go must pass `golangci-lint run` and `go vet`.**
- **Frontend TypeScript is strict.** No `any`. Use `unknown` and narrow.
- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `tasks:` (Beads-only).
- **One issue → one commit (or a clean sequence) → one closure.** No mixed-issue commits.

---

## 6. ScorePlay brand tokens

```typescript
// frontend/src/theme.ts
export const scoreplayTheme = {
  primaryColor: 'scoreplay-green',
  defaultColorScheme: 'dark',
  colors: {
    'scoreplay-green': [
      '#E6FFF3', '#B3FFD9', '#80FFC0', '#4DFFA6', '#1AFF8D',
      '#00FF87', // primary
      '#00CC6C', '#009951', '#006637', '#00331C',
    ],
  },
  black: '#0A0A0A',
  white: '#FAFAFA',
};
```

Surfaces: `#0A0A0A` background, `#161616` cards, `#FAFAFA` primary text, `#A0A0A0` muted. Never default to light mode.

---

## 7. Hard rules — do NOT do these

1. **No LLM at log-write time.** Only at parser-compile time.
2. **No auth, login, multi-user logic.**
3. **No WebSockets.** SSE for server → client push.
4. **No Redis, S3, or external services beyond Postgres.**
5. **Do not casually modify `shared/parser-schema.json`.** Raise it explicitly.
6. **No dependency upgrades alongside feature work.**
7. **Do not close an issue without verifying** (compose up cleanly once it exists).
8. **Do not edit `CLAUDE.md` or `docs/PRD.md`** without explicit instruction from Xav.
9. **No state library, no CSS framework beyond Mantine, no router beyond `react-router-dom`, no form library beyond `@mantine/form`.**
10. **No issues left `in_progress` across sessions.**

---

## 8. The parser schema — read before working on ingestion

Canonical schema at `shared/parser-schema.json`. Go and TypeScript both validate against it.

Illustrative shape:

```typescript
type Parser = {
  match: "Log";
  filters: { path: string; op: "eq"|"neq"|"contains"|"matches"; value: string }[];
  mapping: {
    offset_in: MappingRule;        // typically timecode_to_ms against TC
    offset_out?: MappingRule;
    tags: MappingRule;             // typically tag_lookup_by_name
    source: MappingRule;           // typically literal
  };
};
```

The interpreter reads `started_at_tc` and `frame_rate` from the current `Media` row at runtime — NOT from the parser.

**Reference test case:** `sample-data/rg-point.xml`. Expected output documented in `docs/PRD.md §3.4`.

---

## 9. Out of scope at MVP

See `docs/PRD.md §7`. If a request seems to ask for one, push back — it's been misrouted.

- Auth, multi-user, real-time collaboration
- AI-driven logging
- Auto-segmentation engine
- Export to FCPXML / AAF / EDL
- Cloud deployment
- Customer-facing UI
- Mobile app
- ScorePlay API integration

---

## 10. Decisions still open

See `docs/PRD.md §9`. Do not invent answers — surface them.

1. Test HLS stream source for development.
2. `media_id` provenance.
3. Watch folder → parser mapping rule.
4. Re-launching media with different `started_at_tc` or `frame_rate`.

---

## 11. Session script (your default behaviour)

**At session start, regardless of what Xav says first:**

```
1. Read this file and docs/PRD.md
2. Run: bd ready
3. Run: bd list --status in_progress
4. Run: bd list --status closed --limit 5
5. Greet Xav with a 3-5 line status summary. Example:
     "Last session you closed the backend skeleton (#abc12) and the
     frontend skeleton (#def34). Nothing in_progress. Ready: compose
     wiring (#ghi56). Want to tackle that, or something else?"
```

**During work:**

- Before writing any code, restate the issue's acceptance criteria and propose the approach. Wait for approval.
- Mark in_progress when starting. Close when verified.
- Surface anything that grows the issue's scope. Don't expand silently.
- Commit issue work and Beads bookkeeping separately when natural.

**At session end (Xav signals stop):**

```
1. Recap: closed [X, Y], in_progress [Z if any], next [W]
2. Resolve in_progress (close or revert to open with note)
3. Commit any Beads state changes
4. Push (or remind Xav to push)
```

This loop is the project's heartbeat. Keep it tight.
