# Phase 10 — Architecture Diagram Generation

## Goal
Given an indexed repo, use Gemini to generate two distinct architectural
diagrams: a **system architecture diagram** (layers: frontend, backend,
DB, external APIs) and a **dependency graph** (file/module import
relationships). Both output as Mermaid source + live-rendered preview.
Stored in DB like CareerArtifacts, regeneratable with a cooldown to
prevent Gemini spam. Standalone new page, same pattern as RepoHealth.

Strong portfolio/interview asset — a visual diagram of a codebase is
something a recruiter or interviewer can understand at a glance without
reading code.

## Locked decisions
- **Two diagram types**: `system_architecture` and `dependency_graph`.
  Separate generate buttons, separate stored artifacts, separate rendered
  panels — not a single combined diagram.
- **Output format**: Mermaid source stored in DB; frontend renders with
  `mermaid.js`. Also expose the raw Mermaid source via a "Copy source"
  button — useful for pasting into READMEs, Notion, GitHub wiki.
- **Persistence**: stored in DB (reuse `DiagramArtifact` table, NOT
  `CareerArtifact` — different enough in structure and purpose to warrant
  a clean separation). Regenerate overwrites. Persists across sessions.
- **Cooldown**: per diagram type per project, default
  `settings.diagram_cooldown_minutes = 10` (same default as Repo health).
  The two diagram types have independent cooldowns — regenerating one
  doesn't block the other.
- **Trigger**: on-demand "Generate" button per diagram type. No
  auto-generation on indexing.
- **Context for Gemini**: built from indexed `Chunk` data (already in DB),
  NOT new GitHub API calls. Specifically:
  - For `system_architecture`: use file paths + first chunk per file
    (enough to infer layer membership — frontend/backend/DB/external
    calls). README chunks if present. Cap at
    `settings.diagram_max_chunks = 80` to stay within Gemini context.
  - For `dependency_graph`: use import/require statements extracted from
    chunk content (regex, language-agnostic). Only internal imports (same
    repo paths), not third-party packages. Cap at
    `settings.diagram_max_files = 60` files to keep the graph readable
    and the prompt bounded.
- **Mermaid diagram types to use**:
  - `system_architecture` → `graph TD` (top-down layered graph). Gemini
    instructed to group nodes into subgraphs by layer.
  - `dependency_graph` → `graph LR` (left-right, suits import chains).
- **Validation**: Gemini output must be validated as parseable Mermaid
  before storing. If validation fails (malformed syntax), retry once with
  an explicit "fix the syntax" follow-up prompt before surfacing an error
  to the user — Gemini occasionally produces subtly broken Mermaid on the
  first pass. If second attempt also fails, store nothing and return an
  error; don't store broken Mermaid that will render as a blank/crash.
- **Team access**: same permission model as Career mode —
  `viewer`/`editor` role + a new `diagrams_shared` boolean on `Project`.
  Owner controls whether team members can see diagrams. **Step 0 must
  confirm the central permission dependency from Phase 9 handles this with
  a one-line addition**, not a parallel access-check pattern.
- **Diagram page access for team members**: viewer sees stored diagrams
  read-only (no generate button); editor can generate/regenerate. Same
  pattern as CareerMode viewer/editor split from Phase 9.
- **Public page**: if `is_public=true` on the project AND
  `diagrams_shared=true`, the two diagrams are exposed on the public
  career page (`/u/<username>/<slug>`). Rendered Mermaid, no raw source
  exposed publicly. Add to `PublicProject.jsx` — don't build a separate
  public diagram page.

## Step 0 — confirm before locking implementation
1. Confirm the Phase 9 central permission dependency (`permissions.py`)
   accepts a new `feature="diagrams"` string cleanly — it should just
   work if the feature-flag lookup is driven by a dict/map of
   `feature → Project column`. If it requires code changes, report what
   and wait for go-ahead before Step 2.
2. Confirm `mermaid.js` is not already in the frontend deps. If not,
   we'll add it in Step 5 — just note it, don't install yet.
3. Confirm `DiagramArtifact` doesn't already exist as a model (it
   shouldn't, but check before writing the migration).

## Data model
New table `DiagramArtifact`:
| Column | Type | Notes |
|---|---|---|
| `id` | PK UUID | |
| `project_id` | FK → Project | |
| `diagram_type` | TEXT, CHECK `IN ('system_architecture', 'dependency_graph')` | |
| `mermaid_source` | TEXT | Raw Mermaid string |
| `generated_at` | TIMESTAMPTZ | Set/updated on every successful generate |
| `last_requested_at` | TIMESTAMPTZ, nullable | Updated on every generate attempt (drives cooldown check, even on failure) |

Unique constraint: `(project_id, diagram_type)` — upsert on regenerate.

`Project` — add:
| Column | Type | Notes |
|---|---|---|
| `diagrams_shared` | BOOLEAN NOT NULL DEFAULT false | Team + public access gate |
| `last_diagram_system_at` | TIMESTAMPTZ, nullable | Cooldown for system_architecture |
| `last_diagram_dependency_at` | TIMESTAMPTZ, nullable | Cooldown for dependency_graph |

Two separate cooldown timestamps on `Project` (not on `DiagramArtifact`)
so the cooldown check is a single cheap column read on the project row,
same as `last_health_analysis_at` in Phase 8.

## Backend tasks
1. **Diagram context builder** (`services/diagram_context.py`):
   - `build_system_context(project_id, db)` — queries chunks, extracts
     file paths + first chunk content per file, includes README chunks,
     caps at `diagram_max_chunks`. Returns a structured string for the
     Gemini prompt.
   - `build_dependency_context(project_id, db)` — queries chunks, runs
     import-statement regex across chunk content, builds a
     `{file: [imported_files]}` map of internal-only imports, caps at
     `diagram_max_files` files. Returns structured string.
   - Both are pure DB reads — no GitHub API calls.
2. **Gemini diagram service** (`services/diagram.py`):
   - `generate_diagram(diagram_type, context_str)` — calls Gemini (non-
     streaming, JSON mode off — just raw text output, Mermaid isn't JSON).
     System prompt instructs: output ONLY valid Mermaid, no markdown
     fences, no explanation text, no preamble.
   - `validate_mermaid(source)` — lightweight regex/structural check:
     starts with `graph`, has at least one `-->` or `---` edge, no
     obvious syntax breakers (unclosed brackets, etc). NOT a full parser —
     just enough to catch Gemini's common failure modes.
   - Retry logic: if validation fails, send a second Gemini call with the
     broken output + "fix the Mermaid syntax" instruction. If second
     attempt also fails validation, raise a `DiagramGenerationError`.
3. **ARQ task `generate_diagram_artifact(project_id, diagram_type)`**:
   - Check cooldown (`last_diagram_system_at` or
     `last_diagram_dependency_at` depending on type); reject if within
     window. Update the relevant cooldown timestamp immediately on start
     (before generation) — same race-condition fix applied in Phase 8.
   - Set a `diagram_status` column (see below) to `'generating'`.
   - Build context → generate → validate (with retry) → upsert
     `DiagramArtifact` → set status `'ready'` or `'failed'`.
4. **`Project` additions** beyond the three columns above:
   - `diagram_system_status` TEXT nullable — `null/generating/ready/failed`
   - `diagram_dependency_status` TEXT nullable — same
   - Two status columns (not one) because the two diagram types generate
     independently and can be in different states simultaneously.
5. **Endpoints** (new `routers/diagrams.py`):
   - `POST /projects/{id}/diagrams/{type}/generate` — owner/editor +
     `diagrams` feature flag. Cooldown check → enqueue ARQ task → return
     status. 429 with remaining wait time on cooldown.
   - `GET /projects/{id}/diagrams` — viewer+ + `diagrams` feature. Returns
     both `DiagramArtifact` rows (or null per type if not yet generated),
     plus both status fields and cooldown timestamps.
6. **Public endpoint extension** (`public.py`): extend
   `GET /public/users/{username}/projects/{slug}` to include diagram
   artifacts if `diagrams_shared=true` on the project. Add to existing
   response shape, no new endpoint.
7. **Permission wiring**: add `"diagrams"` → `Project.diagrams_shared` to
   the feature-flag lookup in `permissions.py` — confirm in Step 0 this
   is a one-liner.

## Frontend tasks
1. **`ArchDiagram.jsx`** — standalone page at
   `/diagram/:projectId`, same nav pattern as `RepoHealth`:
   - Two panels side by side (or stacked on narrow): System Architecture
     and Dependency Graph.
   - Each panel: Generate/Regenerate button (owner/editor only), cooldown
     state ("available again in Xm"), status indicator while generating
     (polling `GET /diagrams` every 3s, same pattern as Repo Health
     analyze), rendered Mermaid diagram once ready, "Copy source" button.
   - Viewer state: no generate button, diagram renders read-only if
     artifact exists.
   - Empty state (no artifact yet, owner/editor): "Generate" button
     front and center with a one-line description of what each diagram
     shows.
2. **`mermaid.js` integration**: install as frontend dep, initialize
   once at app level or lazily in `ArchDiagram.jsx`. Render Mermaid
   source into SVG in the browser — no server-side rendering.
3. **`PublicProject.jsx` extension**: if diagram artifacts are present in
   the API response (only when `diagrams_shared=true`), render them below
   the Career mode tabs. Read-only rendered Mermaid, no "Copy source"
   button on public page (keep it clean).
4. **Role-aware UI**: reuse `useProjectRole` hook from Phase 9 — viewer
   sees diagrams read-only, editor/owner can generate. Same amber viewer
   banner pattern as other pages.
5. **Dashboard + nav**: add "Diagram" button/link on project cards
   alongside "Health" and "Team" buttons (owner/editor only, or always
   visible if diagrams exist).

## Sequencing
1. Step 0: confirm permissions.py extension, mermaid.js absent, no
   existing DiagramArtifact model
2. Migration: `DiagramArtifact` table, `Project` additions (3 shared/
   cooldown columns + 2 status columns)
3. Diagram context builder (pure DB, no Gemini yet) — test with a real
   project, print output, confirm it's sane before wiring to Gemini
4. Gemini diagram service + validation + retry logic
5. ARQ task wiring context builder + diagram service + upsert
6. Backend endpoints (`routers/diagrams.py`) + permission wiring +
   public endpoint extension
7. Frontend: install mermaid.js, `ArchDiagram.jsx`
8. Frontend: `PublicProject.jsx` extension
9. Frontend: Dashboard button
10. Smoke test

## Smoke test checklist
- Generate both diagram types on a real indexed project → both render in
  browser as actual Mermaid diagrams, not blank panels or error states.
- Copy source → paste into [mermaid.live](https://mermaid.live) →
  confirm it renders correctly there too (validates Gemini output isn't
  just "valid enough for our regex").
- Immediately click Generate again → cooldown fires, "Wait Xm" shown.
  Each type's cooldown is independent — regenerating system_architecture
  doesn't block dependency_graph.
- Invite a team member (editor), enable `diagrams_shared`, confirm they
  can generate and see both diagrams.
- Invite a viewer, confirm they see diagrams read-only (no generate
  button).
- Disable `diagrams_shared`, confirm team member gets 404 on diagram
  endpoints.
- Enable `is_public` on project → open public page in incognito →
  confirm diagrams render on public page (no login, no copy-source
  button).
- Disable `diagrams_shared` → reload public page → diagrams gone from
  response.
- Confirm public diagram response contains no chunk content, no tokens.

## Do not
- Do not make new GitHub API calls for diagram context — use only already-
  indexed `Chunk` data.
- Do not include third-party package imports in the dependency graph —
  internal repo paths only.
- Do not store a `DiagramArtifact` row if Mermaid validation fails after
  retry — error state only, never persist broken source.
- Do not build a separate public diagram page — extend `PublicProject.jsx`.
- Do not use a single shared cooldown for both diagram types — independent
  cooldowns per type.
- Do not fold UI/UX overhaul into this phase.
- Do not skip the "paste into mermaid.live" manual check in the smoke
  test — our lightweight validator isn't a full parser, and a diagram
  that looks fine in our renderer may be subtly broken.

---

## Roadmap
1. ~~Phase 7~~ Public shareable Career page
2. ~~Phase 8~~ Repo health / hotspot insights
3. ~~Phase 9~~ Team mode
4. ~~Phase 10~~ Architecture diagram generation — **this doc**
5. Phase 11 — PR review assistant (agentic) — last feature phase

Still owed: UI/UX overhaul pass (Dashboard, MentorChat, CareerMode,
RepoHealth, ArchDiagram).
