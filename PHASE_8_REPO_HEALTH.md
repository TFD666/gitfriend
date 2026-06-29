# Phase 8 — Repo Health / Hotspot Insights

## Goal
Surface two distinct risk signals about a user's indexed codebase on a new
standalone page: **Hotspots** (files that are both complex and frequently
changed — the classic "this is where bugs live" signal) and **Stale**
files (long untouched, possibly dead code). Closes the "product feels thin
for daily use" gap — this is the first feature that gives a user a reason
to come back to a project's dashboard after the initial Mentor-mode
exploration and Career-mode generation are done.

## Locked decisions
- **UI placement**: standalone new page (`RepoHealth.jsx`), same pattern
  as `CareerMode.jsx` — own nav entry, own route, project-scoped.
- **Metrics**: complexity + churn/staleness, combined into a hotspot
  score. These are NOT computed the same way:
  - **Complexity** is derived entirely from already-ingested `Chunk` data
    — no new GitHub calls, can run as a pure DB-query background step.
  - **Churn/staleness** requires per-file GitHub commit history, which
    means new GitHub API calls — real cost, real rate-limit exposure.
- **Trigger**: manual "Analyze" button, async job (ARQ), same UX shape as
  Career mode's generate flow — NOT automatic on every re-index. The API
  cost of churn data must stay a visible, user-initiated action, not a
  background surprise.
- **File scope**: bounded to the top N files by LOC (complexity pass
  output), default `N=50` (`settings.repo_health_max_files`), selected
  BEFORE any GitHub API calls are made. This bounds churn-analysis cost to
  a fixed number of API calls per "Analyze" click, independent of total
  repo size — a 2,000-file monorepo and a 50-file project cost the same.
- **Views**: Hotspots and Stale are two separate tabs/lists, not one
  combined table. They answer different questions (where are bugs likely
  vs. what might be dead code) and sort by different things. Both views
  only ever show files from the most recently analyzed top-N set — there
  is no separate "all files" browsing mode in v1.
- **Cooldown**: re-running Analyze is rate-limited to once per
  `settings.repo_health_cooldown_minutes` (default 10) per project. This
  is the actual guardrail against burning API quota from button-mashing,
  not optional polish — implement it for real, don't skip it.
- **Hotspot score formula**: within the analyzed top-N set, min-max
  normalize `complexity_score` and `commit_count`, then
  `hotspot_score = complexity_norm * commit_count_norm` (multiplicative —
  a file must be BOTH complex AND actively changed to rank high; high on
  only one axis should not produce a high score).
- **Stale list**: sorted by `last_commit_at` ascending (oldest first),
  filtered to files untouched for more than
  `settings.repo_health_stale_days` (default 90). No complexity weighting
  — staleness is purely about recency.

## Step 0 — confirm before locking implementation details
Two things to verify against the actual codebase before Step 2 starts:
1. **Ingestion fetch method.** Confirm whether the ingestion pipeline
   fetches files individually via GitHub's Contents API (no git history
   available locally — the expected case, based on the Phase 1
   description) or does a full clone (git history available locally, which
   would make churn/staleness a local `git log` operation instead of a
   GitHub API one — cheaper, no rate-limit concern, but a different
   implementation path entirely). **This spec is written for the
   Contents-API / no-local-history case.** If Step 0 finds a full clone IS
   happening, stop and flag it back — the churn implementation in Step 4
   changes substantially and the rate-limit concerns in this doc partly
   evaporate.
2. **Existing async job status pattern.** The ingestion pipeline already
   runs as an ARQ background job with some way for the frontend to know
   it's done (polling, presumably, given the architecture). Identify that
   exact pattern and reuse it for the Analyze job's status — do not invent
   a second polling/status mechanism.

## Data model changes
New table `FileHealthMetric`:
| Column | Type | Notes |
|---|---|---|
| `id` | PK | |
| `project_id` | FK → Project | |
| `file_path` | varchar | |
| `loc` | int | Summed from this file's chunks |
| `complexity_score` | int | Heuristic proxy, see below — NOT a true cyclomatic complexity, label it as a proxy everywhere it's surfaced (code comments, UI copy) |
| `commit_count` | int, nullable | Null until churn analysis has run for this file |
| `last_commit_at` | timestamp, nullable | Null until churn analysis has run |
| `hotspot_score` | float, nullable | Null until churn analysis has run (needs both axes) |
| `computed_at` | timestamp | |

Unique constraint: `(project_id, file_path)`.

`Project` table — add:
| Column | Type | Notes |
|---|---|---|
| `last_health_analysis_at` | timestamp, nullable | Drives both the cooldown check and the "last analyzed Xm ago" UI text. A single timestamp is enough here — don't build a separate analysis-run-log table for v1, that's premature for what's currently a single-purpose feature. |

## Backend tasks
1. **Complexity service** (pure, DB-only): query `Chunk` rows grouped by
   `file_path` for a project, compute `loc` (line count) and
   `complexity_score` — a heuristic proxy counting control-flow tokens
   (`if/for/while/case/catch/elif/except/switch/&&/||/?:`, language-agnostic
   regex, not per-language AST parsing). Upsert into `FileHealthMetric`.
   Also: delete `FileHealthMetric` rows for files that no longer appear in
   the current chunk set (handles files removed from the repo since last
   index) — don't let those rows linger indefinitely.
2. **Churn service**: for a given file path, call GitHub's commits
   endpoint with `path=<file>&per_page=1`. The single returned commit
   gives `last_commit_at`. The response `Link` header's `rel="last"` page
   number gives the total commit count for that path WITHOUT paginating
   through every commit — one API call per file, not one call per commit.
   Verify this against the real GitHub API during implementation (the
   `Link` header is absent when there's exactly one page, meaning
   count = 1 — handle that case explicitly, don't let a missing header
   default to 0 or null).
3. **ARQ task `analyze_repo_health(project_id)`**:
   - Run the complexity service for all currently-indexed files.
   - Rank by `loc` descending, take top N
     (`settings.repo_health_max_files`).
   - Run the churn service for exactly those N files, update their
     `FileHealthMetric` rows.
   - Compute `hotspot_score` via min-max normalization across that same
     N-file set (files outside the top N keep `complexity_score` but stay
     null on `commit_count`/`last_commit_at`/`hotspot_score`, and
     therefore won't appear in either view).
   - Set `Project.last_health_analysis_at = now()`.
4. **`POST /api/projects/{id}/health/analyze`** (authenticated, owner-only)
   — checks cooldown first (`now() - last_health_analysis_at <
   cooldown_minutes` → reject with remaining wait time, do not enqueue).
   Otherwise enqueues the ARQ task and returns job status info via
   whatever pattern Step 0 identified.
5. **`GET /api/projects/{id}/health`** (authenticated, owner-only) —
   returns `last_health_analysis_at`, `hotspots` (top ~20 by
   `hotspot_score` desc, only rows with non-null `hotspot_score`), `stale`
   (top ~20 by `last_commit_at` asc, filtered to
   `> repo_health_stale_days` old).

## Frontend tasks
1. `RepoHealth.jsx` — new page, new nav entry alongside Career mode,
   project-scoped route.
2. "Analyze" button — disabled with a countdown/timestamp ("last
   analyzed 4m ago, available again in 6m") when on cooldown. Triggers
   the POST endpoint, polls job status using the existing pattern from
   Step 0, refetches `GET /health` on completion.
3. Two tabs: **Hotspots** (file path, complexity_score, commit_count,
   visual score indicator) and **Stale** (file path, last_commit_at as a
   relative date, e.g. "118 days ago").
4. Empty state before first analysis ever runs: "Run analysis to see
   results" with the Analyze button front and center.
5. Loading/polling state while the job runs.

## Sequencing
1. Step 0: confirm ingestion method + existing job-status pattern
2. Migration: `FileHealthMetric` table, `Project.last_health_analysis_at`
3. Complexity service (pure, from existing `Chunk` data)
4. Churn service (GitHub Commits API, Link-header count trick)
5. ARQ task wiring both together, top-N bounding, hotspot_score
   normalization, stale-row cleanup
6. Backend endpoints: `POST .../analyze` (with cooldown), `GET .../health`
7. Frontend: `RepoHealth.jsx`, Analyze button + polling, Hotspots tab,
   Stale tab
8. Smoke test

## Smoke test checklist
- Run Analyze on a real project → confirm it completes and both tabs
  populate.
- Immediately click Analyze again → confirm cooldown rejection, not a
  second job enqueued.
- Inspect actual GitHub API calls made during one run (log them) → confirm
  count equals min(N, total indexed files), not one-per-commit.
- Confirm a file with zero commits in range still shows a
  `complexity_score` but is absent from both Hotspots and Stale (no
  `hotspot_score`, no `last_commit_at`).
- Re-run Analyze after deleting/renaming a file in the repo and
  re-indexing → confirm the stale `FileHealthMetric` row for the old path
  is gone, not just unioned with the new one.

## Do not
- Do not call the GitHub commits API for every file in the repo — only
  the bounded top-N set, regardless of how incomplete that might feel for
  large repos. That bound is the entire point.
- Do not present `complexity_score` as a precise or standard metric (no
  "cyclomatic complexity" labeling) — it's an explicit heuristic proxy,
  say so in the UI.
- Do not auto-trigger analysis on re-index or on page load — manual
  button only.
- Do not skip or weaken the cooldown enforcement.
- Do not merge Hotspots and Stale into a single combined list.
- Do not let `FileHealthMetric` rows accumulate forever for files that no
  longer exist in the repo — clean them up on each analysis run.
- Do not fold the UI/UX overhaul into this page — functional-first, like
  every other phase so far.

---

## Roadmap (unchanged, for reference)
1. ~~Public shareable Career page~~ — done, Phase 7
2. ~~Repo health / hotspot insights~~ — this doc, Phase 8
3. Team mode (Phase 5) — `TeamMember` model unused since Phase 1
4. Architecture diagram generation
5. PR review assistant (agentic)

Still owed, slot in whenever convenient: `CLAUDE.md` refresh (now stale
since Phase 3 — Career mode, Summarization, Phase 6, and Phase 7 are all
undocumented), UI/UX overhaul pass.
