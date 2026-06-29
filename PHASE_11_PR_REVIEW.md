# Phase 11 — PR Review Assistant

## Goal
Given a PR number, fetch the diff, RAG-augment it with relevant indexed
codebase context, and use Gemini to produce a structured review: an
overall verdict + summary, plus inline file/line comments. Reviews are
stored per PR (last N runs kept). Displayed inside DevKit with an
optional "Post to GitHub" button that submits the review as a real GitHub
PR review. This is the last feature phase — highest complexity, highest
"wow" factor for SDE interviews.

## Locked decisions
- **Output shape**: overall verdict (`approve` / `request_changes` /
  `comment`) + summary paragraph + list of inline comments (file path,
  line number, comment type, body). Both summary and inline comments are
  required in every review — not optional.
- **Context sourcing**: RAG. Diff is split into per-file hunks → each
  hunk embedded → pgvector similarity search against indexed chunks →
  top-K relevant codebase chunks fetched → Gemini receives diff +
  retrieved context together in one prompt. NOT a tool-use/agentic loop
  — one embedding pass, one Gemini call.
- **Persistence**: `PRReview` + `PRReviewComment` tables. Per PR, keep
  last `settings.pr_review_max_runs` runs (default 5). On each new
  review, insert first, then delete oldest if count exceeds limit.
- **History view**: list of past runs for a PR (by `reviewed_at`),
  clickable to view any stored run. Different PRs = different history
  lists.
- **GitHub posting**: show review in DevKit always. "Post to GitHub"
  button submits via `POST /repos/{owner}/{repo}/pulls/{pr}/reviews` API.
  This requires `pull_requests: write` OAuth scope — **see Step 0, this
  is the hardest constraint in this phase.**
- **Trigger**: owner only. Same as Repo health analyze — editor/viewer
  can read stored reviews, not trigger new ones.
- **Team access**: new `pr_review_shared` boolean on `Project` (same
  pattern as other features). Owner controls. Permission dependency
  addition is a one-liner per Phase 9 pattern.
- **UI placement**: standalone new page `PRReview.jsx` at
  `/pr-review/:projectId`. Nav entry alongside Health, Diagrams.
- **Phase 4 summarization overlap**: Phase 4 built a lightweight PR
  diff summary (Redis-cached, no storage, no inline comments). Phase 11
  is a completely different feature — deeper, stored, RAG-augmented.
  They coexist; do NOT remove or merge the Phase 4 summarize endpoint.

## Step 0 — hard gates before anything else
**This step may require a product decision before implementation can
proceed. Do not start Step 2 until both items below are resolved.**

1. **OAuth scope audit**: check the current GitHub OAuth authorization
   URL in `auth.py`. List every scope currently requested. Then confirm
   whether `pull_requests: write` (or the broader `repo` scope which
   includes it) is already present.
   - If `pull_requests: write` IS already covered (e.g. `repo` scope
     is requested): "Post to GitHub" button works with existing tokens,
     no OAuth changes needed.
   - If it is NOT covered: posting to GitHub requires re-requesting OAuth
     with the new scope. Existing users' stored tokens cannot post reviews.
     Two options: (a) add the scope and force a re-auth flow for all users
     on next login, or (b) build "Post to GitHub" as a clearly-labeled
     future feature (button exists but is disabled with a tooltip
     explaining the scope limitation). **Report the finding and wait for
     a decision before proceeding.**

2. **Existing PR diff fetch method**: the Phase 4 summarization already
   calls `github.get_pull_request_diff()`. Confirm this function exists,
   what it returns (raw diff string? parsed? structured?), and whether it
   already handles large diffs gracefully (truncation, error on 404 PR,
   etc.). The RAG pipeline in Step 3 needs to split this output into
   per-file hunks — confirm the return format before building the splitter.

## Data model
New table `PRReview`:
| Column | Type | Notes |
|---|---|---|
| `id` | PK UUID | |
| `project_id` | FK → Project | |
| `pr_number` | int | |
| `run_number` | int | Per-PR incrementing counter (1, 2, 3…) |
| `pr_title` | varchar, nullable | Fetched from GitHub at review time |
| `pr_author` | varchar, nullable | GitHub login of PR author |
| `verdict` | TEXT, CHECK `IN ('approve','request_changes','comment')` | |
| `summary` | TEXT | Overall assessment paragraph |
| `reviewed_at` | TIMESTAMPTZ | |

Unique constraint: `(project_id, pr_number, run_number)`.
Index: `(project_id, pr_number)` for history list queries.

New table `PRReviewComment`:
| Column | Type | Notes |
|---|---|---|
| `id` | PK UUID | |
| `review_id` | FK → PRReview CASCADE | |
| `file_path` | varchar | |
| `line_number` | int, nullable | Null = file-level comment, not line-specific |
| `comment_type` | TEXT, CHECK `IN ('issue','suggestion','praise','nitpick')` | |
| `body` | TEXT | |
| `github_posted` | boolean, default false | Flipped to true after successful GitHub post |

`Project` — add:
| Column | Type | Notes |
|---|---|---|
| `pr_review_shared` | boolean, NOT NULL DEFAULT false | |

No cooldown columns on `Project` for this feature — PR reviews are
bounded by the PR diff size and the RAG K parameter, not an unbounded
analysis job like Repo health. Rate-limit concern is lower; if it becomes
a problem, add cooldown in a follow-up.

## Backend tasks
1. **Diff splitter** (`services/pr_context.py`):
   - `split_diff_into_hunks(diff_str)` — splits raw unified diff into
     per-file sections. Returns `list[{file_path, hunk_text}]`. Handle
     edge cases: binary files (skip), deleted files (include with note),
     very large single-file diffs (truncate hunk at
     `settings.pr_max_hunk_chars`, default 4000 chars).
   - `build_review_context(project_id, diff_str, db)` — for each hunk:
     embed the hunk text, pgvector similarity search (top
     `settings.pr_rag_k` chunks, default 3 per hunk), deduplicate
     retrieved chunks across hunks (same chunk may be relevant to
     multiple hunks — include it once). Returns structured context string:
     diff hunks interleaved with their retrieved codebase context.
   - Cap total context at `settings.pr_max_context_chars` (default
     12000) — truncate least-relevant retrieved chunks first if over
     limit.

2. **Gemini review service** (`services/pr_review.py`):
   - Single Gemini call, JSON mode ON. System prompt instructs: output
     a JSON object with keys `verdict`, `summary`, `comments` (array of
     `{file_path, line_number, comment_type, body}`). `line_number` must
     be an integer or null — never a string.
   - Validate response structure before storing: check all required keys
     present, `verdict` is one of the three allowed values, every comment
     has at least `file_path`, `comment_type`, and `body`. If validation
     fails, retry once with a "fix the JSON structure" follow-up — same
     pattern as diagram generation.
   - `line_number` values from Gemini may not correspond to actual diff
     line numbers reliably — this is a known LLM limitation. Store them
     as-is; don't attempt to validate against the diff. Document this in
     code comments.

3. **GitHub post service** (`services/github_review.py`, only if Step 0
   confirms scope is available):
   - `post_github_review(project, pr_number, verdict, summary, comments)`
     — calls `POST /repos/{owner}/{repo}/pulls/{pr_number}/reviews` with
     the review body and inline comments. Maps `comment_type` to GitHub
     review body text (e.g. `[ISSUE]`, `[SUGGESTION]` prefix).
   - File-level comments (null `line_number`) go into the review body,
     not as inline comments (GitHub inline comments require a valid diff
     position).
   - On success: update `PRReviewComment.github_posted = true` for all
     posted comments. On partial failure (some comments rejected by
     GitHub): post what succeeds, log failures, don't surface as a full
     error.

4. **ARQ task `run_pr_review(project_id, pr_number)`**:
   - Fetch PR metadata (title, author) and diff via existing
     `github.get_pull_request_diff()`.
   - Build review context via `build_review_context()`.
   - Call Gemini review service → validated structured output.
   - Compute `run_number`: `MAX(run_number) + 1` for this
     `(project_id, pr_number)`, or 1 if first run.
   - Insert `PRReview` + `PRReviewComment` rows.
   - Enforce max runs: delete oldest run(s) if count exceeds
     `pr_review_max_runs` (cascade deletes comments).
   - No status column on `Project` for this feature — instead, use the
     existing ARQ job-enqueue pattern and let the frontend poll
     `GET /pr-reviews/{project_id}/pr/{pr_number}` until a new run
     appears.

5. **Endpoints** (`routers/pr_review.py`):
   - `POST /projects/{id}/pr-reviews` — owner only, no feature flag
     needed (owner always can). Body: `{pr_number: int}`. Enqueues ARQ
     task, returns `{job: "queued", pr_number}`.
   - `GET /projects/{id}/pr-reviews` — viewer+ + `pr_review` feature.
     Returns list of distinct reviewed PR numbers + latest run metadata
     (title, verdict, reviewed_at). The "history index."
   - `GET /projects/{id}/pr-reviews/{pr_number}` — viewer+ + feature.
     Returns all runs for this PR (up to max_runs), each with full
     summary + comments.
   - `POST /projects/{id}/pr-reviews/{pr_number}/runs/{run_id}/post-to-github`
     — owner only. Calls the GitHub post service for the given run.
     Returns count of comments posted + any failures.
   - Permission wiring: add `"pr_review"` → `"pr_review_shared"` to
     `_FEATURE_FLAG` in `permissions.py` (one-liner, same as every phase).

## Frontend tasks
1. **`PRReview.jsx`** — standalone page at `/pr-review/:projectId`:
   - PR number input + "Review" button (owner only; editor/viewer see
     read-only history).
   - History index: list of previously reviewed PRs, each showing PR
     number, title, latest verdict badge, timestamp. Clicking opens the
     run list for that PR.
   - Run list for a PR: each run as a collapsible card showing verdict
     badge, summary, and inline comment list (file path, line, type,
     body). Multiple runs side by side for easy comparison.
   - "Post to GitHub" button on each run (owner only, only if not yet
     posted). Disabled with tooltip if Step 0 found scope is unavailable.
   - Polling while review is in progress (3s interval on
     `GET /pr-reviews/{pr_number}`, same pattern as Repo health).
   - Verdict badge colors: approve = green, request_changes = red,
     comment = yellow. Comment type badges: issue = red, suggestion =
     blue, praise = green, nitpick = gray.
2. **`useProjectRole` hook**: already exists from Phase 9 — reuse
   directly, no changes needed.
3. **Dashboard**: add "PR Review" button on project cards alongside
   Health, Diagrams, Team buttons.

## Sequencing
1. Step 0: OAuth scope audit + diff fetch method confirmation
2. Migration: `PRReview`, `PRReviewComment` tables, `pr_review_shared`
   on `Project`
3. Diff splitter + RAG context builder (pure, no Gemini) — print output
   for a real PR before wiring Gemini
4. Gemini review service + JSON validation + retry
5. GitHub post service (only if Step 0 confirmed scope available)
6. ARQ task wiring everything together + max-runs enforcement
7. Backend endpoints + permission wiring
8. Solo-owner regression check before frontend
9. Frontend: `PRReview.jsx` + Dashboard button
10. Smoke test

## Smoke test checklist
- Submit a real PR number → review generates → summary + at least 1
  inline comment rendered in DevKit UI.
- Submit the same PR again → second run appears, first run still
  accessible. Both runs visible in history.
- Submit until max_runs exceeded → oldest run is deleted, newest N
  remain.
- Viewer with `pr_review_shared=true` → can see history, cannot trigger
  review (button absent/disabled).
- Editor with `pr_review_shared=true` → same as viewer (owner-only
  trigger).
- Disable `pr_review_shared` → team member loses access (404).
- "Post to GitHub" button (if scope confirmed): click → open actual PR
  on GitHub → confirm comments appear as a review.
- "Post to GitHub" disabled state (if scope NOT confirmed): tooltip
  explains limitation clearly.
- Non-existent PR number → clear error in UI, no stored row.

## Do not
- Do not remove or modify the Phase 4 summarize endpoint — they coexist.
- Do not attempt to validate Gemini's `line_number` values against the
  actual diff — store as-is, document the limitation.
- Do not add a cooldown for this feature in v1 — if needed, add later.
- Do not build "Post to GitHub" if Step 0 finds scope is unavailable —
  disabled button with tooltip only, no partial implementation.
- Do not let editors trigger new reviews — owner only.
- Do not skip the Step 3 gate (print diff splitter output for a real PR
  before wiring Gemini) — same reason as Phase 10's context builder gate.
- Do not fold UI/UX overhaul into this phase.

---

## Roadmap
1. ~~Phase 7~~ Public shareable Career page
2. ~~Phase 8~~ Repo health / hotspot insights
3. ~~Phase 9~~ Team mode
4. ~~Phase 10~~ Architecture diagram generation
5. ~~Phase 11~~ PR review assistant — **this doc, final feature phase**

Remaining after this: UI/UX overhaul pass (Dashboard, MentorChat,
CareerMode, RepoHealth, ArchDiagram, PRReview).
