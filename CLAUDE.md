# DevKit AI — Claude Code Project Brief

## What this project is
DevKit AI is a full-stack web app that connects to a developer's GitHub account,
indexes their code using embeddings + RAG, and powers several features:
- **Mentor mode** — natural-language Q&A over a codebase with file citations + file/PR summarization
- **Career mode** — AI-generated portfolio pages, resume bullets, and interview prep; shareable public pages
- **Repo Health** — hotspot analysis (complexity × commit frequency) and stale-file detection
- **Team mode** — invite collaborators with Editor/Viewer roles and per-feature sharing toggles

## Stack
| Layer | Tech |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL 15 + pgvector extension |
| AI | Google Gemini API — gemini-2.5-flash (generation), gemini-embedding-001 (embeddings). Both model names are config-driven via settings.gemini_generation_model / settings.gemini_embedding_model, not hardcoded — see config.py. |
| Task queue | ARQ (async Redis Queue) |
| Cache | Redis |
| Frontend | React 18, Vite, TailwindCSS, React Query |
| Auth | GitHub OAuth 2.0 (GitHub App) |
| Deploy | Railway (backend), Neon (DB), Vercel (frontend) |

## Project structure
```
devkit/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entrypoint
│   │   ├── config.py            # Settings via pydantic-settings
│   │   ├── database.py          # Async SQLAlchemy engine + session
│   │   ├── dependencies.py      # get_current_user JWT dependency
│   │   ├── permissions.py       # Central permission dependency (require_project_access)
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── project.py
│   │   │   ├── chunk.py         # Code chunks + vector embeddings
│   │   │   ├── team_member.py
│   │   │   ├── chat_message.py  # Persisted chat history
│   │   │   ├── career_artifact.py
│   │   │   ├── file_health_metric.py
│   │   │   └── summary_cache.py # File/PR summarization cache
│   │   ├── routers/
│   │   │   ├── auth.py          # GitHub OAuth + /me endpoint
│   │   │   ├── projects.py      # Repo connect, index, list (shared + owned)
│   │   │   ├── chat.py          # Mentor mode Q&A (streaming SSE)
│   │   │   ├── summarize.py     # File + PR summarization
│   │   │   ├── career.py        # Portfolio, resume, interview prep
│   │   │   ├── health.py        # Repo health analysis endpoints
│   │   │   ├── team.py          # Team management + invite flow
│   │   │   └── public.py        # Public profile/project pages (no auth)
│   │   ├── services/
│   │   │   ├── github.py        # GitHub API client wrapper
│   │   │   ├── ingestion.py     # Repo fetch → chunk → embed → store
│   │   │   ├── rag.py           # Query embed → vector search → LLM
│   │   │   ├── career.py        # Portfolio + resume generation logic
│   │   │   ├── summarize.py     # File + PR summarization logic
│   │   │   ├── health.py        # Hotspot scoring + stale detection
│   │   │   ├── llm.py           # Gemini API wrapper (streaming + standard)
│   │   │   └── slug.py          # Unique slug generation for public pages
│   │   └── workers/
│   │       ├── main.py          # WorkerSettings — registers all ARQ jobs
│   │       ├── indexing.py      # ARQ job: repo fetch → chunk → embed → store
│   │       └── health.py        # ARQ job: health analysis (complexity + git log)
│   ├── alembic/                 # DB migrations
│   ├── tests/
│   │   └── test_permissions.py  # 22 unit tests for central permission dependency
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx    # Repo list (owned + shared), invite badge
│   │   │   ├── MentorChat.jsx   # Mentor mode chat UI (role-aware)
│   │   │   ├── CareerMode.jsx   # Portfolio + resume + interview (role-aware)
│   │   │   ├── RepoHealth.jsx   # Hotspot + stale file tables (role-aware)
│   │   │   ├── TeamSettings.jsx # Member roster, invite form, sharing toggles
│   │   │   ├── InvitesInbox.jsx # Pending invites with accept/decline
│   │   │   ├── Auth.jsx         # GitHub OAuth callback
│   │   │   ├── PublicProfile.jsx # Public user profile (no auth)
│   │   │   └── PublicProject.jsx # Public project page (no auth)
│   │   ├── hooks/
│   │   │   └── useProjectRole.js # Derives owner/editor/viewer for current user
│   │   └── api/
│   │       ├── client.js        # Axios instance (withCredentials)
│   │       ├── auth.js          # getMe → {id, github_username}
│   │       ├── projects.js      # Project CRUD + health triggers
│   │       ├── career.js        # listArtifacts, generateArtifact
│   │       ├── summarize.js     # summarizeFile, summarizePR
│   │       ├── team.js          # Team roster, invite, sharing, invites inbox
│   │       └── public.js        # Public profile/project fetches
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── CLAUDE.md                    # ← this file
├── docker-compose.yml           # Local dev: postgres + redis
└── .env.example
```

## Core data models (simplified)

```python
# User — authenticated via GitHub OAuth
User: id, github_id, github_username, github_access_token_encrypted, email, created_at

# Project — a connected GitHub repo
Project: id, user_id, github_repo_full_name,
         index_status (pending/indexing/ready/failed), last_indexed_at,
         is_private, is_public, slug, published_at,
         health_status (None/running/ready/failed), last_health_analysis_at,
         mentor_chat_shared, career_mode_shared, repo_health_shared,  # sharing flags
         created_at

# TeamMember — invited collaborators (owner has NO TeamMember row)
TeamMember: id, project_id, user_id,
            role (editor/viewer),        # TEXT + CHECK constraint, not PG enum
            status (pending/active),     # TEXT + CHECK constraint
            invited_at, accepted_at (nullable)
# Unique constraint: (project_id, user_id)

# Chunk — a code chunk with its embedding
Chunk: id, project_id, file_path, start_line, end_line, content (text),
       embedding (vector(768)), language, created_at

# ChatMessage — persisted mentor chat history
ChatMessage: id, project_id, role (user/assistant), content, citations (JSON),
             seq (ordering), created_at

# CareerArtifact — generated career content
CareerArtifact: id, project_id, artifact_type (portfolio/resume_bullets/interview_prep),
                content (JSON), model_version, generated_at, updated_at

# FileHealthMetric — per-file health data from analysis
FileHealthMetric: id, project_id, file_path, loc, complexity_score,
                  commit_count, last_commit_at, hotspot_score, analyzed_at

# SummaryCache — cached file/PR summaries
SummaryCache: id, project_id, cache_key (sha256 of content), summary, created_at
```

## Key architectural decisions

**Vector store**: pgvector inside PostgreSQL — no separate vector DB.
Similarity search: `ORDER BY embedding <=> CAST(:param AS vector) LIMIT 10`
Note: use `CAST(:param AS vector)` not `:param::vector` — the `::` suffix breaks
SQLAlchemy's named-param substitution with asyncpg (silent PostgresSyntaxError).

**Embeddings**: 768-dim via Gemini (gemini-embedding-001, `output_dimensionality=768`).
Gemini's native output is 3072-dim; the param is required, not optional.

**Ingestion pipeline** (ARQ background job):
1. Fetch repo file tree via GitHub API
2. Filter to code files only (skip binaries, lock files, node_modules, .git)
3. Chunk by function/class boundary where possible, otherwise ~150 lines
4. Batch-embed via Gemini gemini-embedding-001
5. Upsert chunks into `chunks` table with pgvector

**RAG query loop**:
1. Embed question via Gemini (768-dim)
2. Vector similarity search → top 8 chunks
3. Send citations as structured SSE event BEFORE generation starts:
   `data: {"citations": [...]}` — built from chunk metadata, NOT parsed from LLM output
4. Stream generation via Gemini streamGenerateContent (alt=sse)
   Each delta: `data: {"delta": "..."}` (JSON-encoded to avoid raw newlines breaking SSE)
   Stream ends: `data: {"done": true}`
   Any error: `data: {"error": "..."}` (never drop the connection)

**Streaming**: FastAPI `StreamingResponse` + SSE.
Frontend uses `fetch` + `ReadableStream` (NOT `EventSource` — needs POST with body).
The RAG pipeline (embed → search → generate) runs inside one try/except; failure anywhere
yields a clean error event. SSE sessions open their own `AsyncSessionLocal` sessions
(not `get_db`) so no DB connection is held idle during the 30-60s generation call.

**Central permission dependency** (`app/permissions.py`):
Every route that touches a project goes through `require_project_access(role, feature)`.
No route implements its own ownership check — this is a hard rule.

```python
# Factory returns a FastAPI dependency with role + feature captured in closure.
require_project_access("viewer", "mentor_chat")  # → dependency
require_project_access("editor")                 # → dependency, no feature flag
require_project_access("owner")                  # → dependency, owner-only
```

Access logic (in order):
1. Project not found → 404
2. `project.user_id == current_user.id` → **owner short-circuit** (bypasses ALL checks)
3. No active TeamMember row → 404
4. `required_role="owner"` → 404 (only owner passes, checked above)
5. Feature flag off on project → 404 (AND semantics — role alone is not enough)
6. `required_role="editor"` but member is viewer → 404
7. All checks pass → return project

All denials return 404 (not 403) — consistent with not revealing project existence.

**Team access model**:
- Owner: `project.user_id` — no TeamMember row, full access including team management
- Editor: can read + write all shared features (chat, career generate, health analyze)
  but cannot manage team membership or sharing settings (owner-only)
- Viewer: read-only across all features; write/generate/analyze controls hidden in UI
- Sharing flags: three independent booleans per project (`mentor_chat_shared`,
  `career_mode_shared`, `repo_health_shared`). Team member needs BOTH an active role
  AND the feature flag enabled. Flags default false.
- Invite flow: pending → accept (status=active) or decline (row deleted)
- Owner has no TeamMember row; ownership transfer not supported in v1

**Repo Health analysis** (ARQ background job):
- Triggered by `POST /projects/{id}/health/analyze` (editor+ required)
- 10-minute cooldown enforced in the router (sets `health_status=running` + commits
  BEFORE enqueuing so a second immediate POST sees the running state)
- Worker computes: LOC, complexity proxy (control-flow token count), git commit frequency
- `hotspot_score = normalize(complexity) × normalize(commit_count)`
- Stale = files with `last_commit_at < now() - stale_days`
- Results stored in `file_health_metric` (upsert by project_id + file_path)
- Deleted files: stale FileHealthMetric rows cleaned up on next analysis run

**Public pages** (`/u/:username/:slug`):
- `POST /projects/{id}/publish` toggles `is_public` + generates a unique slug
- Public routes have no auth — read `CareerArtifact` content directly
- Owner's GitHub username + slug form the URL

**File/PR summarization**:
- Cached by content hash (SHA-256) in `summary_cache` table
- File summarize: fetches chunk content from DB, generates via Gemini
- PR summarize: fetches diff via GitHub API using project owner's token
  (team editors authorized but may not have direct GitHub access to private repos)

## API conventions
- All routes prefixed with `/api/v1/`
- Auth via JWT in httpOnly cookie (not localStorage)
- Errors return `{ "detail": "message" }` — FastAPI default
- Async everywhere — `async def` for all handlers and DB calls
- Pydantic v2 for request/response schemas
- `ProjectResponse` includes `user_id` so frontend can determine ownership client-side
- `GET /auth/me` returns `{id, github_username}`

## Route summary (Phase 9 state)

```
GET    /api/v1/projects                          viewer — owned + shared
POST   /api/v1/projects                          authenticated
GET    /api/v1/projects/{id}                     viewer
POST   /api/v1/projects/{id}/index               editor
PATCH  /api/v1/projects/{id}/publish             owner

POST   /api/v1/chat/{id}                         editor + mentor_chat
GET    /api/v1/chat/{id}/history                 viewer + mentor_chat

POST   /api/v1/summarize/{id}/file               editor (no feature flag)
POST   /api/v1/summarize/{id}/pr                 editor (no feature flag)

POST   /api/v1/career/{id}/{type}                editor + career_mode
GET    /api/v1/career/{id}/{type}                viewer + career_mode
GET    /api/v1/career/{id}                       viewer + career_mode

POST   /api/v1/projects/{id}/health/analyze      editor + repo_health
GET    /api/v1/projects/{id}/health              viewer + repo_health

GET    /api/v1/projects/{id}/team                viewer (no feature flag)
POST   /api/v1/projects/{id}/team/invite         owner
DELETE /api/v1/projects/{id}/team/{member_id}    viewer (self) or owner (anyone)
PATCH  /api/v1/projects/{id}/settings/sharing    owner

POST   /api/v1/invites/{id}/accept               invitee only
POST   /api/v1/invites/{id}/decline              invitee only
GET    /api/v1/me/invites                        authenticated

GET    /api/v1/public/users/{username}           no auth
GET    /api/v1/public/projects/{slug}            no auth
```

## Environment variables (see .env.example)
```
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://localhost:6379
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=
GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-001   # optional override
GEMINI_GENERATION_MODEL=gemini-2.5-flash      # optional override
JWT_SECRET=
# IMPORTANT: no inline comments on this line — pydantic-settings does not strip trailing # comments
ENCRYPTION_KEY=
FRONTEND_URL=http://localhost:5173
REPO_HEALTH_COOLDOWN_MINUTES=10               # optional override
REPO_HEALTH_STALE_DAYS=90                     # optional override
```

## Local dev startup commands

**Always use these exact commands.** On Windows, `python -m uvicorn` via `Start-Process`
causes the reload worker to inherit the system Python binary rather than the venv.
Using `venv\Scripts\uvicorn.exe` directly avoids this. Confirmed via `/health` endpoint.

```powershell
# 1. Infrastructure (Postgres + Redis)
docker-compose up -d

# 2. DB migrations
cd backend
.\venv\Scripts\python.exe -m alembic upgrade head

# 3. Backend — MUST use uvicorn.exe, NOT python -m uvicorn
.\venv\Scripts\uvicorn.exe app.main:app --reload --port 8000

# 4. ARQ worker (separate terminal) — required for indexing + health analysis
cd backend
.\venv\Scripts\python.exe -m arq app.workers.main.WorkerSettings

# 5. Frontend (separate terminal)
cd frontend
npm run dev
```

## Code style
- Python: Black formatter, 88 char line length, type hints everywhere
- No `print()` — use Python `logging` module
- React: functional components only, no class components
- CSS: Tailwind utility classes only, no custom CSS files
- Commit style: conventional commits (`feat:`, `fix:`, `chore:`)

## Project status
- Phase 1 (backend foundation) — done
- Phase 2 (Mentor mode: RAG chat) — done, includes Phase 2.1 bugfixes (real SSE streaming,
  structured citations, pgvector cast fix, Gemini model migration)
- Phase 3 (Career mode: portfolio, resume bullets, interview prep) — done
- Phase 4 (PR + file summarization with caching) — done
- Phase 5–7 (public shareable career pages, slug-based URLs) — done
- Phase 8 (Repo health: hotspot analysis, stale detection, cooldown) — done
- Phase 9 (Team mode: roles, invite flow, per-feature sharing, role-aware UI) — done
- Phase 10 onward (architecture diagram generation, PR review assistant) — see PROJECT_ROADMAP.md

## Do not
- Do not store GitHub access tokens in plaintext — encrypt at rest
- Do not call the LLM synchronously in a request handler — use streaming or background tasks
- Do not index binary files, node_modules, .git, or lock files (package-lock.json, poetry.lock)
- Do not hardcode any secrets — all config via environment variables
- Do not use `SELECT *` — always specify columns in SQLAlchemy queries
- Do not hardcode Gemini model name strings — always read from settings.gemini_embedding_model /
  settings.gemini_generation_model (multiple models deprecated during this project's development)
- Do not let any route implement its own project ownership/access check — everything goes
  through `require_project_access()` in permissions.py. One inline check is how this silently breaks.
- Do not create a placeholder/shadow User for an invite to a username that hasn't signed up —
  return a 400 with a clear message instead
- Do not implement ownership transfer (not supported in v1)
- Do not let a sharing flag bypass the role check, or a role bypass the sharing flag —
  both conditions are required independently (AND semantics, enforced in permissions.py)
- Do not expose chunk content, citations, raw code, Mentor chat history, or GitHub tokens
  through any public (no-auth) endpoint
project memory container
