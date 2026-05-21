# Agent context — Logging Studio

This file is read by every agent that works on this repo (Mayor, polecats, Witnesses). It defines the constraints, conventions, and "what not to do" for this project. **Read this before doing anything else.**

For the full product specification, read [`docs/PRD.md`](docs/PRD.md) after this file.

---

## 1. What this project is

A local-first MVP of ScorePlay's **Logging Studio**: a tool for adding timecoded logs (in/out points + tags) to video, used by ScorePlay loggers to annotate live and VOD sports broadcasts. Two ways to create logs:

1. **Manual logging** — a human watches video and presses hotkeys to mark events.
2. **Sidecar ingestion** — XML or JSON files dropped into a watch folder are parsed into logs by user-defined parsers (compiled once via LLM, then run deterministically without an LLM).

The entire system runs on the developer's machine via `docker compose up`. No cloud, no external services, no auth, no multi-user. If this MVP validates, it gets re-platformed into ScorePlay's main infrastructure separately.

---

## 2. Stack — non-negotiable

Do not change these without an explicit instruction from the human owner (Xav).

| Layer | Choice | Notes |
|---|---|---|
| Backend language | **Node.js 20 + TypeScript** | Strict mode on |
| Backend framework | **Fastify** | Not Express |
| Database | **SQLite via better-sqlite3** | File at `/db/logging.db`, embedded in backend container |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Never modify schema by hand |
| Validation | **Zod** | All API inputs validated, all parser specs validated |
| Frontend build | **Vite** | |
| Frontend framework | **React 18 + TypeScript** | |
| Component library | **Mantine v7** | Dark theme by default |
| Video playback | **hls.js** | |
| File watcher | **chokidar** | |
| Shared types | `/shared` workspace package | Imported by both backend and frontend |
| Container orchestration | **docker compose** | Two services: `backend`, `frontend` |
| LLM client | **@anthropic-ai/sdk** | Used at parser-compile time only |

No Express, no Prisma, no Tailwind, no Redux, no Zustand, no WebSockets at MVP (Server-Sent Events instead). No alternative video players, no alternative ORMs. If you think there's a reason to deviate, escalate via `gt escalate` instead of switching.

---

## 3. Repo layout

```
logging-studio/
├── docker-compose.yml
├── README.md
├── AGENTS.md
├── docs/
│   └── PRD.md
├── shared/                 # shared TS types, parser schema
│   ├── package.json
│   └── src/
│       ├── types.ts        # Log, Media, Tag, TagGroup, Session, IngestParser
│       └── parser-schema.ts
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── drizzle.config.ts
│   └── src/
│       ├── index.ts        # Fastify boot
│       ├── db/             # schema, migrations, client
│       ├── routes/         # logs, media, tags, sessions, parsers, events
│       └── ingest/         # watcher, interpreter, compiler
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── theme.ts        # Mantine theme with ScorePlay tokens
│       ├── api/            # typed fetch wrappers
│       ├── routes/         # studio, tags, parsers, sessions
│       └── components/
├── watch/                  # mounted into backend; sidecar drop zone
├── db/                     # mounted into backend; SQLite lives here
└── sample-data/
    └── rg-point.xml        # one canonical XML sample, used in tests
```

**Conventions for the layout:**
- `shared/` is a workspace package, not a copied folder. Backend and frontend both import from `@logging-studio/shared`.
- Routes are thin. Business logic lives in service modules under `backend/src/services/` (create when needed, don't pre-create empty folders).
- One file per route group (`routes/logs.ts`, `routes/tags.ts`), not one file per endpoint.
- Tests live next to the file they test (`interpreter.ts` + `interpreter.test.ts`).

---

## 4. Coding conventions

- **No premature abstraction.** Write the same thing twice. Extract on the third occurrence.
- **No state management library on the frontend.** `useState` + TanStack Query is the ceiling at MVP.
- **All API inputs validated with Zod** at the route handler boundary. No exceptions.
- **All times in milliseconds internally.** SMPTE timecode is purely a display format; it never appears in a database column or in the API. Conversion happens at the edges (interpreter input, UI display).
- **Frame rate is per-parser**, defaulted to 25 fps. Stored on the parser, not on media.
- **IDs are UUIDs (v4) for everything except Media**, where the `id` is supplied externally (it's the ScorePlay asset id).
- **No console.log in committed code.** Use a logger (pino is fine; Fastify ships with it).
- **Strict TypeScript.** No `any`. If you need to escape the type system, use `unknown` and narrow.
- **Frontend imports go top-down**: React → external libs → `@logging-studio/shared` → local `./...`.
- **One concern per bead.** If a bead's title contains the word "and", split it before working it.

---

## 5. ScorePlay brand tokens (frontend theme)

The Mantine theme must apply these:

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

Surfaces: `#0A0A0A` background, `#161616` cards, `#FAFAFA` primary text, `#A0A0A0` muted text. The studio is used in dark broadcast rooms — never default to light mode anywhere.

---

## 6. Hard rules — do NOT do these

Doing any of these without an explicit override from Xav is grounds for the work being rejected:

1. **Do not call an LLM at log-write time.** The LLM is only used during *parser compilation*, in the Parsers UI. Sidecar ingestion at runtime is pure interpreter — Zod-validated parser JSON in, Log records out.
2. **Do not introduce auth, login, sessions, or multi-user logic.** This MVP runs locally for one user.
3. **Do not introduce WebSockets, Socket.IO, or any bidirectional pubsub.** Use Server-Sent Events for the one place we need server → client push (new ingested logs landing).
4. **Do not introduce Postgres, Redis, S3, or any external service.** SQLite + filesystem only.
5. **Do not modify `shared/src/parser-schema.ts` casually.** It's a stable interface. If a change is genuinely needed, raise it explicitly; don't sneak it in.
6. **Do not commit dependency upgrades alongside feature work.** Lockfile bumps in their own bead.
7. **Do not skip running `docker compose up --build` before marking a bead done.** If the studio doesn't open at localhost:5173 with no console errors, the work is not done.
8. **Do not use `any`.** Reach for `unknown` + narrow, or a generic, or — usually — a better type.
9. **Do not add a state management library, a CSS framework other than Mantine's built-ins, a router other than `react-router-dom`, or a form library other than Mantine's `@mantine/form`.**
10. **Do not edit `AGENTS.md` or `docs/PRD.md` without an explicit request.** These are owner-controlled.

---

## 7. The parser schema — read before working on ingestion

This is the single most important interface in the system. It's the format that the LLM compiles to and the interpreter runs against.

```typescript
// shared/src/parser-schema.ts (canonical version lives in code; this is illustrative)
import { z } from 'zod';

const FilterRule = z.object({
  path: z.string(),               // XPath (XML) or JSONPath (JSON)
  op: z.enum(['eq', 'neq', 'contains', 'matches']),
  value: z.string(),
});

const MappingRule = z.discriminatedUnion('type', [
  z.object({ type: z.literal('literal'),    value: z.string() }),
  z.object({ type: z.literal('xpath'),      path: z.string() }),
  z.object({ type: z.literal('jsonpath'),   path: z.string() }),
  z.object({
    type: z.literal('timecode_to_ms'),
    path: z.string(),
    frame_rate: z.number().default(25),
    minus_ms: z.number().default(0),
    plus_ms: z.number().default(0),
  }),
  z.object({
    type: z.literal('tag_lookup_by_name'),
    path: z.string(),
    on_missing: z.enum(['create', 'reject', 'skip']).default('create'),
    default_group: z.string().default('Imported'),
  }),
  // string ops: concat, lower, trim, regex_extract
]);

export const ParserSchema = z.object({
  match: z.literal('Log'),
  filters: z.array(FilterRule),
  mapping: z.object({
    offset_in: MappingRule,
    offset_out: MappingRule.optional(),
    tags: MappingRule,
    source: MappingRule,
  }),
});

export type Parser = z.infer<typeof ParserSchema>;
```

**Reference test case:** `sample-data/rg-point.xml`. Any work on the interpreter or compiler must keep the test against this file green. The expected output for this file is documented in `docs/PRD.md §3.4`.

---

## 8. Workflow expectations for Gas Town polecats

- Read `AGENTS.md` (this file) and `docs/PRD.md` before starting a bead.
- For beads touching the parser, also read `sample-data/rg-point.xml` and the existing interpreter tests.
- Run `docker compose up --build` locally before `gt done`. Wait for both services to be healthy.
- If you discover the bead is bigger than expected (>800 lines, or hits a Hard Rule above), escalate via `gt escalate -s MEDIUM "<reason>"` instead of expanding scope.
- If you discover a real bug outside your bead, open a new bead with `bd create`; do not silently fix it.
- Run TypeScript, ESLint, and tests before marking done:
  ```
  pnpm -w typecheck
  pnpm -w lint
  pnpm -w test
  ```
- Use Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`).

---

## 9. Out of scope at MVP (don't build these)

These are in the PRD's "rejected for MVP" list. If a bead seems to ask for them, escalate — something has been misrouted.

- Auth, multi-user, real-time collaboration.
- AI-driven logging (transcript or visual).
- Auto-segmentation rule engine (cutting 16h ingest into matches).
- Export to FCPXML / AAF / EDL.
- Cloud deployment, Kubernetes, Postgres, Kafka.
- Customer-facing UI or any white-labeling.
- Mobile companion app.
- Push to ScorePlay APIs.

---

## 10. Decisions still open (don't invent answers — escalate)

These are flagged in `docs/PRD.md §9`. If a bead depends on one of these, do not silently pick a side; escalate.

1. Test HLS stream source for development.
2. Whether `media_id` validates against ScorePlay or is free-form.
3. Watch folder → parser mapping rule (default assumption: one subdirectory per parser, by directory name).
4. Frame rate per parser vs. per media (current default: per parser, see §4).