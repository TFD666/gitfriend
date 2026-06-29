# Phase 9 — Team Mode

## Goal
Let a project owner invite collaborators with scoped roles (Editor /
Viewer) and per-feature visibility control, replacing the current
single-owner-only model where `project.user_id != current_user.id` gates
every single route. `TeamMember` has existed in the DB since Phase 1 with
zero endpoints using it — this phase is what finally builds on it.

**This is the highest-risk phase so far**, not because any one piece is
hard, but because of blast radius: the access-control path for Mentor
chat, Career mode, Repo health, and project CRUD all need to move from an
ad hoc owner check to a centralized permission system, without breaking
existing solo-owner usage in the process. Treat the regression risk to
already-shipped features as seriously as the new functionality.

## Locked decisions
- **Roles**: Owner (existing `project.user_id`, unchanged), Editor, Viewer.
  Owner does NOT get a `TeamMember` row — ownership stays exactly as it is
  today. `TeamMember` only ever holds invited Editor/Viewer rows. No
  ownership transfer in v1.
- **Editor vs Viewer**: Viewer is read-only everywhere they have access.
  Editor can trigger/use everything an Owner can (send Mentor chat
  messages, generate Career artifacts, run Repo health Analyze) EXCEPT
  managing team membership or sharing settings — those stay Owner-only.
- **Per-project feature sharing**: Owner controls three independent
  booleans per project — `mentor_chat_shared`, `career_mode_shared`,
  `repo_health_shared`. All default `false`. A team member needs BOTH an
  active role on the project AND the specific feature's flag enabled to
  access that feature — role and sharing-flag are an AND, neither alone
  is sufficient. (A Viewer on a project with `career_mode_shared=false`
  cannot see Career mode at all, regardless of their role.)
- **Invite mechanism**: GitHub username only, v1. Owner enters a
  username; if no `User` row exists for it, return a clear error — do
  NOT create a placeholder/shadow user. Email and shareable-link invites
  are explicitly deferred (no email infra exists in the stack today;
  adding it is a separate, later decision).
- **Invite flow**: invite creates a `TeamMember` row with
  `status='pending'`. The invited user sees it as a pending invite they
  must accept; only on accept does `status` become `'active'` and access
  actually activate. Declining (or the owner removing a pending invite)
  deletes the row outright — no retained "declined" state to manage.
- **Leaving / removal**: Owner can remove any member at any time. Any
  member (Editor or Viewer) can remove themselves (leave the project).
- **Permission denial returns 404**, consistent with the existing
  `project.user_id != current_user.id` pattern — a project a user can't
  access shouldn't confirm its own existence via a 403 either.
- **Centralization is mandatory**: every route that currently does its
  own `project.user_id != current_user.id` check, and every new
  team-aware route, goes through ONE shared permission dependency. No
  route gets its own hand-rolled access check. This is the single most
  important constraint in this phase — see "Do not" list.

## Step 0 — confirm before locking the migration
1. **Read the existing `TeamMember` model and its Phase-1 migration
   exactly as it stands today** — columns, types, constraints. This spec
   describes the target shape below; reconcile against what's actually
   there (extend/alter it, don't create a competing table).
2. **Audit every route currently performing a
   `project.user_id != current_user.id`-style check** (or equivalent) and
   list them all out before touching any of them. This is the full blast
   radius for Steps 4-8 — Mentor chat, Career mode, Repo health,
   Summarization, project CRUD, and anything else gating on project
   ownership. Report the full list back before proceeding past Step 0.

## Data model
`TeamMember` (extend existing table to this shape, reconciling with
whatever Step 0 finds already present):
| Column | Type | Notes |
|---|---|---|
| `id` | PK | |
| `project_id` | FK → Project | |
| `user_id` | FK → User | |
| `role` | enum: `editor` / `viewer` | Never `owner` — see locked decisions |
| `status` | enum: `pending` / `active` | |
| `invited_at` | timestamp | |
| `accepted_at` | timestamp, nullable | Set on accept |

Unique constraint: `(project_id, user_id)`.

`Project` — add:
| Column | Type | Notes |
|---|---|---|
| `mentor_chat_shared` | boolean, default `false` | |
| `career_mode_shared` | boolean, default `false` | |
| `repo_health_shared` | boolean, default `false` | |

## Backend tasks
1. **Central permission dependency**, e.g.
   `get_project_access(project_id, current_user, required_role="viewer",
   feature=None)`:
   - Load project; not found → 404.
   - `project.user_id == current_user.id` → full access, short-circuit
     (Owner bypasses both role and sharing-flag checks entirely).
   - Else look up `TeamMember(project_id, user_id=current_user.id,
     status="active")`; none found → 404.
   - If `feature` is given, check the corresponding `*_shared` flag on
     `Project`; `false` → 404, even though the user IS a project member —
     this is the AND semantics from the locked decisions.
   - Check role satisfies `required_role` (`editor` satisfies both
     `editor` and `viewer` requirements; `viewer` only satisfies
     `viewer`).
   - Build and unit-test this in isolation, with no real routes wired to
     it yet, before Step 4.
2. **Migrate Project CRUD / Dashboard listing routes first** (smallest
   blast radius) — replace their ad hoc ownership check with the new
   dependency (`required_role="viewer"`, no `feature`). Smoke test
   immediately: existing solo-owner usage must be byte-for-byte unchanged
   before touching anything else.
3. **Team management endpoints**:
   - `POST /api/projects/{id}/team/invite` (Owner only) — body
     `{github_username, role}`. 400 with a clear message if no `User`
     exists for that username. Creates `TeamMember(status="pending")`.
   - `GET /api/projects/{id}/team` — any active member (any role) can see
     the roster; invite/remove/role-change actions stay Owner-only at the
     action level, not the read level.
   - `POST /api/invites/{team_member_id}/accept` /
     `.../decline` — only the invited user (`current_user.id ==
     TeamMember.user_id`) can call these. Accept sets `status="active"`,
     `accepted_at=now()`. Decline deletes the row.
   - `DELETE /api/projects/{id}/team/{team_member_id}` — Owner can remove
     anyone; a member can remove their own row.
   - `PATCH /api/projects/{id}/settings/sharing` (Owner only) — toggles
     the three `*_shared` booleans.
   - `GET /api/me/invites` — current user's pending invites across all
     projects, for the invite inbox.
4. **Migrate Mentor chat routes** onto the permission dependency
   (`feature="mentor_chat_shared"`, `required_role="editor"` for sending
   messages, `"viewer"` for reading history). Smoke test Mentor chat
   end-to-end for both a solo owner AND a team member before moving on.
5. **Migrate Career mode routes** the same way
   (`feature="career_mode_shared"`). Smoke test.
6. **Migrate Repo health routes** the same way
   (`feature="repo_health_shared"`) — extra care here since this is the
   feature that just shipped last phase; a regression here is the most
   likely place for something subtle to break unnoticed. Smoke test
   against the exact same checklist used in Phase 8, not just the new
   team-access cases.

## Frontend tasks
1. **Team management panel** (project settings) — member list with
   roles, invite-by-username form (Owner only), remove-member action,
   the three sharing toggles (Owner only). Non-owners see the roster
   read-only.
2. **Pending invites inbox** — a small dedicated view or dropdown listing
   the current user's pending invites with accept/decline actions, plus
   a nav indicator when invites are pending.
3. **Dashboard project listing** — currently shows only
   `project.user_id == current_user.id` projects; extend to also include
   projects where the user has an active `TeamMember` row. Visually
   distinguish "yours" from "shared with you."
4. **Role-aware UI** in `MentorChat`, `CareerMode`, `RepoHealth` — Viewer
   sees read-only views with generate/send/analyze controls hidden or
   disabled, not just failing silently if they're clicked.

## Sequencing
1. Step 0: audit existing `TeamMember` schema + full list of routes
   currently doing ownership checks
2. Migration: reconcile `TeamMember` to target shape, add `Project`
   sharing-flag columns
3. Central permission dependency, unit-tested in isolation
4. Migrate Project CRUD/Dashboard routes onto it; smoke test solo-owner
   regression
5. Team management endpoints (invite, accept/decline, list, remove,
   sharing toggles)
6. Migrate Mentor chat routes; smoke test both solo and team-member paths
7. Migrate Career mode routes; smoke test both paths
8. Migrate Repo health routes; smoke test both paths AND re-run the
   Phase 8 checklist
9. Frontend: team management panel
10. Frontend: pending invites inbox + nav indicator
11. Frontend: Dashboard shared-project listing
12. Frontend: role-aware UI across all three feature pages
13. Full smoke test (below)

## Smoke test checklist
This phase needs a second GitHub test account — borrow/create one before
starting, you can't test team access with only your own account.
- **Regression**: every existing solo-owner flow (Mentor chat, Career
  mode, Repo health, project CRUD) still works identically to before this
  phase, for the Owner.
- Invite a second account as Editor on a project with all three sharing
  flags off → confirm they see the project in their Dashboard but get
  404s on Mentor chat / Career mode / Repo health (membership without
  sharing = no feature access).
- Enable `mentor_chat_shared` → confirm the Editor can now read AND send
  in Mentor chat; confirm a Viewer (separate invite) can read but sending
  is blocked/hidden.
- Confirm Editor CANNOT access team management or sharing-toggle
  endpoints (403/404, and the UI doesn't expose them).
- Remove a member → confirm their access is revoked immediately (not just
  hidden in UI — verify via direct API call).
- A member leaves a project themselves → confirm same immediate effect.
- Invite a GitHub username with no existing account → confirm a clear
  error, not a silent no-op or a created placeholder user.

## Do not
- Do not let any route implement its own ownership/access check —
  everything goes through the one central permission dependency. This is
  the entire point of doing this centrally; a single route that
  "helpfully" keeps its old inline check is how this silently breaks.
- Do not create a placeholder/shadow `User` for an invite to a username
  that hasn't signed up — clear error instead, full stop.
- Do not implement ownership transfer in v1.
- Do not build email or shareable-link invites this phase.
- Do not let a sharing flag bypass the role check, or a role bypass the
  sharing flag — both conditions are required, independently, every time.
- Do not skip the solo-owner regression smoke test at Step 4 before
  moving on to the feature-route migrations — if that regresses, it's a
  five-minute fix now and a multi-feature debugging session later.
- Do not fold the UI/UX overhaul into this phase.

---

## Roadmap (unchanged, for reference)
1. ~~Public shareable Career page~~ — done, Phase 7
2. ~~Repo health / hotspot insights~~ — done, Phase 8
3. ~~Team mode~~ — this doc, Phase 9
4. Architecture diagram generation
5. PR review assistant (agentic)

Still owed, slot in whenever convenient: `CLAUDE.md` refresh (stale since
Phase 3 — Career mode, Summarization, Phase 6, 7, and 8 all undocumented),
UI/UX overhaul pass.
