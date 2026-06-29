# Phase 7 — Public Shareable Career Page

## Goal
Make Career mode output actually usable *outside* the app. Right now a
user's portfolio summary / resume bullets / interview prep live behind
login in `CareerMode.jsx` — a recruiter can't see them without an account.
This phase adds an explicit per-project "publish" toggle that exposes a
read-only, no-login-required public page at a readable URL, plus a public
profile page aggregating all of a user's published projects.

This is the first thing on a longer roadmap (see bottom of doc) — kept
deliberately small and shippable on its own rather than folded into a
bigger "public-facing app" effort.

## Locked decisions
- **Scope of public link**: both a profile page (`/u/<username>`) and
  individual project pages (`/u/<username>/<project-slug>`).
- **Visibility default**: every project is private (`is_public = false`)
  until the owner explicitly publishes it. No account-wide toggle, no
  publish-by-default.
- **URL scheme**: readable, username + slug based — not a random token.
  Readability is the point (this is meant to go on a resume/LinkedIn).
  Un-publishing removes public access immediately; the toggle is the only
  access control, there is no separate secret.
- **Data freshness**: live, not a snapshot. The public page queries
  `CareerArtifact` directly at request time. If the user regenerates
  artifacts in Career mode, the public page reflects that on next load —
  no separate "publish snapshot" step or stale-copy table.
- **What's exposed publicly**: ONLY `CareerArtifact` content
  (portfolio / resume_bullets / interview_prep) plus minimal project
  metadata (name, short description, primary language). Never chunk
  content, citations, Mentor chat history, GitHub tokens, or repo
  internals of any kind. This is a hard boundary, not a default to relax
  later — see "Do not" list.
- **Username source**: reuse the GitHub OAuth login as the public
  username. **Step 0 below is to confirm this field already exists on
  `User`; if it doesn't, add and backfill it as part of this phase** —
  don't invent a separate "display name" concept.
- **Unpublished / nonexistent states**: a username that doesn't exist
  → 404. A username that exists but has zero published projects → 200,
  profile page renders with an empty state ("no public projects yet"),
  not a 404 — existence of an account isn't treated as sensitive.
  A project slug that exists but `is_public = false` → 404 (not 403 —
  don't confirm the project's existence to an unauthenticated caller).

## Data model changes
`Project` table — add:
| Column | Type | Notes |
|---|---|---|
| `slug` | `varchar`, unique per `user_id` (not globally unique) | Generated from project name at publish time, kebab-case, deduped with numeric suffix on collision (`my-app`, `my-app-2`) |
| `is_public` | `boolean`, default `false` | The only access-control gate for public endpoints |
| `published_at` | `timestamp`, nullable | Set on first publish, untouched on later edits; cleared on unpublish |

`User` table — confirm/add:
| Column | Type | Notes |
|---|---|---|
| `username` | `varchar`, unique | **Check if this already exists from GitHub OAuth profile data before adding it.** If it exists under a different name (e.g. `github_login`), reuse it — don't create a duplicate column. |

No changes to `CareerArtifact` — it's already keyed on
`(project_id, artifact_type)` and that's exactly what the public project
page needs to read.

## Backend tasks
1. **Step 0 — confirm/add `User.username`.** Check the existing `User`
   model first. If a GitHub-login-equivalent field already exists, write
   the migration to reuse it (alias or rename, not duplicate). If it
   genuinely doesn't exist, add it and backfill from stored OAuth profile
   data for existing users.
2. Migration: add `slug`, `is_public`, `published_at` to `Project`.
3. Slug generation utility (kebab-case from project name, collision
   suffix). Used both for backfilling existing projects (set but leave
   `is_public = false`) and for new publishes.
4. `PATCH /api/projects/{id}/publish` (authenticated, owner-only) —
   toggles `is_public`, generates `slug` on first publish if not already
   set, sets/clears `published_at`. Returns the public URL.
5. New public router, fully separate from the authenticated project
   routes — easy to audit that nothing sensitive leaks in one place:
   - `GET /api/public/users/{username}` → profile data + list of
     published projects (name, slug, short description, primary
     language). Empty list if no public projects; 404 only if the
     username doesn't exist.
   - `GET /api/public/users/{username}/projects/{slug}` → project
     metadata + its `CareerArtifact` rows (portfolio, resume_bullets,
     interview_prep). 404 if project doesn't exist OR `is_public` is
     false — same response either way, no distinguishing signal.
6. Explicitly verify (and write a smoke-test step for) that the public
   router has no path to chunk content, chat history, or GitHub tokens —
   it should only ever query `Project` (limited columns) and
   `CareerArtifact`.

## Frontend tasks
1. `CareerMode.jsx` — add a publish toggle per project. When on, show the
   public URL with a copy-link button. Toggling calls the new PATCH
   endpoint. Add a one-line warning on first enable: this makes the page
   visible to anyone with the link, no login required.
2. New public-facing routes, rendered **outside** the authenticated app
   shell (no sidebar/nav that assumes a logged-in session, no auth guard):
   - `PublicProfile.jsx` at `/u/:username`
   - `PublicProject.jsx` at `/u/:username/:slug`
3. Keep these pages visually simple/functional for now — consistent with
   how every other phase shipped functional-first. They're an obvious
   candidate to revisit in the deferred UI/UX overhaul, but don't fold
   that work in here.
4. Handle the empty-profile and 404 states explicitly in the UI rather
   than letting them fall through to a generic error boundary.

## Sequencing
1. Step 0: confirm/add `User.username`
2. Migration: `Project.slug` / `is_public` / `published_at`
3. Slug generation utility + backfill existing projects
4. Public read-only endpoints (profile, project)
5. Authenticated publish/unpublish endpoint
6. Frontend: publish toggle + copy-link in `CareerMode.jsx`
7. Frontend: `PublicProfile.jsx` route + component
8. Frontend: `PublicProject.jsx` route + component
9. Smoke test (see below)

## Smoke test checklist (do this in an actual incognito window, not just the dev session)
- Publish a project → open the returned URL in a fresh incognito window
  with zero cookies → content renders with no login prompt.
- Un-publish → reload the same URL → 404.
- Visit `/u/<username>` for a user with no published projects → empty
  state, not an error.
- Visit `/u/<doesnt-exist>` → 404.
- Confirm the public project page response contains no chunk text, no
  citation data, no chat history, no token fields — inspect the actual
  network response, not just what the UI happens to render.
- Regenerate a Career artifact in the authenticated app → reload the
  public page → confirms live-read behavior (no stale cache).

## Do not
- Do not expose chunk content, citations, raw code snippets, Mentor chat
  history, or GitHub tokens through any public endpoint, under any
  circumstance.
- Do not build a public "list all users" or "list all projects"
  endpoint — usernames must be known, not discoverable.
- Do not build snapshotting/caching for public pages this phase — live
  query against `CareerArtifact` per the locked decision above.
- Do not build rate limiting or anti-scraping protection this phase —
  real gap, explicitly deferred, flag it again before this goes anywhere
  near a real deploy (Phase 8 territory).
- Do not fold the UI/UX overhaul into these new public pages — keep them
  functional-first like everything else has been.
- Do not silently resolve slug collisions with a scheme not specified
  here — flag it if the dedup logic gets more complicated than expected.
- Do not require any cookie, session, or auth header on the public
  routes — if it doesn't work in a stripped-down incognito window, it's
  not done.

---

## Roadmap (not in scope for this phase — logged for later)
Ranked order from our planning discussion:
1. ~~Public shareable Career page~~ — **this doc, Phase 7**
2. Repo health / hotspot insights — daily-use dashboard utility
3. Team mode (Phase 5) — `TeamMember` model has existed since Phase 1
   with zero endpoints using it; biggest lift, real permission-model
   design work
4. Architecture diagram generation — Gemini + indexed chunks → visual
   system diagram, strong portfolio asset
5. PR review assistant (agentic) — RAG-walks a diff and produces actual
   review comments, not just a summary; highest "wow" factor, also
   highest complexity

Also still owed, to slot in around the above whenever it makes sense —
not blocking, not urgent:
- `CLAUDE.md` refresh (stale since Phase 3 — Career mode, Summarization,
  and all of Phase 6 are undocumented in it)
- UI/UX overhaul pass (Dashboard, MentorChat, CareerMode — deliberately
  deferred until features stabilized)
