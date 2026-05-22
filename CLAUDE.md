# CLAUDE.md — Logging Studio

Claude Code reads this file at the start of every session in this repo. It defines the project, the stack, the conventions, and how we work together with Beads as the task tracker.

**Before doing anything: read `docs/PRD.md` in full.** This file is the operating manual; the PRD is the spec.

---

## 1. What this is

Local-first MVP of ScorePlay's **Logging Studio** — a tool for adding timecoded logs (in/out points + tags) to video. Two ways to create logs:

1. **Manual logging** — a human watches video and presses hotkeys to mark events.
2. **Sidecar ingestion** — XML or JSON files dropped into a watch folder are parsed into logs by user-defined parsers (compiled once via LLM, then run deterministically without an LLM at runtime).

Runs entirely on the developer's machine via `docker compose up`. No cloud, no auth, no multi-user.

---

## 2. Stack — non-negotiable

Do not change these without explicit confirmation from Xav.

| Layer | Choice | Notes |
|---|---|---|
| Backend language | **Go 1.22+** | Strict linting via golangci-lint |
| Backend framework | **Gin** | github.com/gin-gonic/gin |
| Database | **Postgres 16 + pgvector** | Containerized, volume-mounted |
| DB driver | **pgx/v5** | github.com/jackc/pgx/v5, with pgxpool |
| Query layer | **sqlc** | SQL files in `internal/db/queries/`, generated code committed |
| Migrations | **golang-migrate** | Files in `internal/db/migrations/` |
| Validation | **go-playground/validator** | Struct tags |
| File watcher | **fsnotify** | github.com/fsnotify/fsnotify |
| LLM client | **anthropic-sdk-go** | Used at parser-compile time only |
| Frontend build | **Vite** | |
| Frontend framework | **React 18 + TypeScript** | |
| Component library | **Mantine v7** | Dark theme by default |
| Video playback | **hls.js** | |
| Cross-stack types | **JSON Schema at `shared/parser-schema.json`** | Source of truth; Go and TS validate against it |
| Container orchestration | **docker compose** | Three services: `postgres`, `backend`, `frontend` |

---

## 3. Working with Beads

Beads is this project's task tracker. The database lives at `.beads/` in the repo and is committed alongside code.

**Use Beads for:**
- Breaking down PRD work into trackable issues
- Recording dependencies between tasks
- Logging what's done and what's next
- Keeping context between sessions — when a session ends, the next session reads Beads to know where we left off

**Essential commands:**

```bash
bd list                         # show open issues
bd list --status in_progress    # what's actively being worked on
bd ready                        # issues whose blockers are cleared
bd show <id>                    # full detail on one issue
bd create -t "title" -d "..."   # new issue
bd update <id> --status closed  # mark done
bd block <id> --on <other-id>   # mark dependency
```

**Conventions for issues in this project:**
- One issue per logical PR (roughly 200-800 lines of changes).
- Title format: short imperative ("Add /health endpoint", "Wire postgres in compose").
- Description must include: goal, acceptance criteria (concrete and testable), verification step.
- Every issue ends with "and `docker compose up --build` still works" as a verification line, unless the issue itself is about infrastructure that hasn't been wired yet.
- Dependencies marked explicitly with `bd block`.
- When closing an issue, leave a one-line summary of what actually shipped (useful when returning later).

**Session start ritual:**

At the start of every Claude Code session, run:

```bash
bd ready
```

This shows what's actionable right now. Pick one, read it with `bd show <id>`, work it, close it. If a session is interrupted, the next session reads Beads and resumes.

---

## 4. Repo layout (target — built up over time)

```
loggingstudio/
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── .beads/                         # Beads DB, committed
├── docs/
│   └── PRD.md
├── shared/
│   └── parser-schema.json          # canonical parser JSON schema
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   ├── go.sum
│   ├── cmd/server/main.go
│   └── internal/
│       ├── db/
│       │   ├── migrations/
│       │   ├── queries/
│       │   └── generated/          # sqlc output — committed
│       ├── domain/
│       ├── handlers/
│       ├── ingest/
│       └── validation/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── theme.ts
│       ├── api/
│       ├── routes/
│       └── components/
├── watch/                          # mounted into backend, sidecar drop zone
├── pgdata/                         # mounted into postgres
└── sample-data/
    └── rg-point.xml
```

Don't pre-create empty directories. Build them up as actual code lands.

---

## 5. Coding conventions

- **No premature abstraction.** Write something twice before extracting it.
- **All API inputs validated** at the handler boundary. No exceptions.
- **All times in milliseconds internally.** SMPTE timecode is purely a display format.
- **IDs are UUIDs (v4) for everything except Media**, where `id` is supplied externally (the ScorePlay asset id).
- **No `console.log` / `fmt.Println` in committed code.** Use a logger.
- **Backend Go code must pass `golangci-lint run` and `go vet`.**
- **Frontend TypeScript is strict mode.** No `any`. Use `unknown` and narrow.
- **Conventional Commits** for messages (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).

---

## 6. ScorePlay brand tokens (frontend theme)

```typescript
// frontend/src/theme.ts
export const scoreplayTheme = {
  primaryColor: 'scoreplay-green',
  defaultColorScheme: 'dark',
  colors: {
    'scoreplay-green': [
      '#E6FFF3', '#B3FFD9', '#80FFC0', '#4DFFA6', '#1AFF8D',
      '#00FF87', // index 5 — primary
      '#00CC6C', '#009951', '#006637', '#00331C',
    ],
  },
  black: '#0A0A0A',
  white: '#FAFAFA',
};
```

Surfaces: `#0A0A0A` background, `#161616` cards, `#FAFAFA` primary text, `#A0A0A0` muted text. Studio is used in dark broadcast rooms — never default to light mode anywhere.

---

## 7. Hard rules — do NOT do these

1. **Do not call an LLM at log-write time.** The LLM is only used during *parser compilation*, in the Parsers UI. Sidecar ingestion at runtime is pure interpreter.
2. **Do not introduce auth, login, sessions, or multi-user logic.** MVP runs locally for one user.
3. **Do not introduce WebSockets.** Use Server-Sent Events for the one place we need server → client push (new ingested logs landing).
4. **Do not introduce Redis, S3, or any external service beyond Postgres.**
5. **Do not casually modify `shared/parser-schema.json`.** It's a stable interface. If a change is needed, raise it explicitly.
6. **Do not commit dependency upgrades alongside feature work.** Lockfile bumps in their own commit.
7. **Do not mark an issue done without running `docker compose up --build`** (once the compose file exists) and confirming the studio opens cleanly.
8. **Do not edit `CLAUDE.md` or `docs/PRD.md` without explicit instruction from Xav.**
9. **Do not add a state management library, a CSS framework other than Mantine's built-ins, a router other than `react-router-dom`, or a form library other than Mantine's `@mantine/form`.**

---

## 8. The parser schema — read before working on ingestion

The canonical parser schema lives at `shared/parser-schema.json` (JSON Schema document). Both Go (backend) and TypeScript (frontend) validate against it. The interpreter executes parsers that conform to it.

**Illustrative shape** (the real schema is the JSON file):

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

The interpreter reads `started_at_tc` and `frame_rate` from the current `Media` row at runtime — they are NOT properties of the parser.

**Reference test case:** `sample-data/rg-point.xml`. Any work on the interpreter or compiler must keep tests against this file green. Expected output documented in `docs/PRD.md §3.4`.

---

## 9. Out of scope at MVP (don't build these)

Flagged in `docs/PRD.md §7`. If an issue seems to ask for one, push back — it's been misrouted.

- Auth, multi-user, real-time collaboration
- AI-driven logging (transcript or visual)
- Auto-segmentation rule engine (cutting 16h ingests into matches)
- Export to FCPXML / AAF / EDL
- Cloud deployment, Kubernetes, Kafka
- Customer-facing UI or any white-labeling
- Mobile companion app
- Push to ScorePlay APIs

---

## 10. Decisions still open

Flagged in `docs/PRD.md §9`. Do not invent answers — surface the question.

1. Test HLS stream source for development.
2. Whether `media_id` validates against ScorePlay or is free-form.
3. Watch folder → parser mapping rule (default: one subdirectory per parser).
4. Re-launching against an existing media with different `started_at_tc` or `frame_rate`.

---

## 11. How we work — workflow summary

1. **Start session:** `bd ready` to see what's actionable.
2. **Pick one issue:** `bd show <id>` for full context.
3. **Update status:** `bd update <id> --status in_progress`.
4. **Do the work.** Read relevant code, write the change, run tests.
5. **Verify:** ensure `docker compose up --build` still passes (once it exists), or whatever the issue's verification step is.
6. **Commit:** Conventional Commit message referencing the issue id.
7. **Close issue:** `bd update <id> --status closed` with a one-line summary of what shipped.
8. **End session:** if anything was learned that affects future work, create new issues with `bd create`.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
