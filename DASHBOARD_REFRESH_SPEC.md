# Dashboard Refresh — Spec

## Reference
Read DESIGN_SYSTEM.md. All tokens apply. No hardcoded hex values.

## What's changing
Current dashboard: project cards only, empty sidebar, no user info.
New dashboard: stats row + activity feed + richer project cards +
user profile in sidebar bottom + theme toggle.

This spec has TWO parts:
1. New backend endpoints (lightweight, needed for stats + activity)
2. Frontend changes

---

## Part 1 — Backend (do first)

### `GET /api/v1/stats`
Owner only (uses `current_user`). Returns aggregated counts:
```json
{
  "project_count": 3,
  "total_chunks": 847,
  "pr_reviews_count": 12,
  "artifacts_count": 7
}
```
Queries:
- `project_count`: `COUNT(*) FROM projects WHERE user_id = current_user.id`
- `total_chunks`: `COUNT(*) FROM chunks WHERE project_id IN (owned projects)`
- `pr_reviews_count`: `COUNT(DISTINCT pr_number) FROM pr_reviews WHERE project_id IN (owned projects)`
- `artifacts_count`: `COUNT(*) FROM career_artifacts WHERE project_id IN (owned projects)`
No joins needed — 4 separate count queries, all fast.

### `GET /api/v1/activity`
Owner only. Returns last 20 activity events across all owned projects.
Derive from existing tables — NO new table needed.

Query strategy: UNION of timestamped events from multiple tables:
```sql
(SELECT 'indexed' as type, github_repo_full_name as project_name,
        project_id, updated_at as ts FROM projects
 WHERE user_id = ? AND index_status = 'ready')
UNION ALL
(SELECT 'pr_reviewed', p.github_repo_full_name, r.project_id, r.reviewed_at
 FROM pr_reviews r JOIN projects p ON p.id = r.project_id
 WHERE p.user_id = ?)
UNION ALL
(SELECT 'artifact_generated', p.github_repo_full_name, a.project_id, a.updated_at
 FROM career_artifacts a JOIN projects p ON p.id = a.project_id
 WHERE p.user_id = ?)
UNION ALL
(SELECT 'diagram_generated', p.github_repo_full_name, d.project_id, d.generated_at
 FROM diagram_artifacts d JOIN projects p ON p.id = d.project_id
 WHERE p.user_id = ?)
UNION ALL
(SELECT 'health_analyzed', p.github_repo_full_name, p.id, p.last_health_analysis_at
 FROM projects p
 WHERE p.user_id = ? AND p.last_health_analysis_at IS NOT NULL)
ORDER BY ts DESC LIMIT 20
```

Response shape per event:
```json
{
  "type": "pr_reviewed",
  "project_name": "Artyuglandingpage-NEXTJS",
  "project_id": "...",
  "ts": "2025-01-15T10:30:00Z"
}
```

### `POST /api/v1/auth/logout`
If not already exists: clear the `access_token` cookie, return 200.
Check if logout endpoint exists before adding — don't duplicate.

### `GET /api/v1/auth/me` extension
Already returns `github_username`. Add `avatar_url` field —
store/return `https://github.com/${github_username}.png` (GitHub's
public avatar URL pattern, no API call needed).

---

## Part 2 — Frontend

## New Dashboard layout
```
┌─────────────────────────────────────────────────────────────────┐
│ Sticky header: "Projects"                    [+ Add project]     │
├─────────────────────────────────────────────────────────────────┤
│ Stats row (4 cards, full width)                                  │
├──────────────────────────────────────┬──────────────────────────┤
│ Project cards grid (flex-1)          │ Activity feed (300px)     │
│                                      │                           │
│ [card] [card]                        │ Recent activity list      │
│ [card]                               │                           │
└──────────────────────────────────────┴──────────────────────────┘
```
Main area: `display: flex`, `gap: 24px`.
Left: `flex: 1`, project cards grid as before.
Right: `width: 300px`, `flex-shrink: 0`, activity feed.

## Stats row
`display: grid`, `grid-template-columns: repeat(4, 1fr)`, `gap: 16px`,
`margin-bottom: 24px`.

Each stat card:
```
┌──────────────────────┐
│ 847                  │
│ Chunks indexed       │
└──────────────────────┘
```
- Container: `--bg-surface`, `border: 1px solid --border`,
  `border-radius: --radius-lg`, `padding: 16px 20px`
- Number: `.mono`, `font-size: 28px`, `font-weight: 700`, `--text-primary`
- Label: `font-size: 12px`, `--text-muted`, `margin-top: 4px`
- Icon: 16px lucide icon, `--accent`, top-right of card

Four stats + icons:
| Stat | Label | Icon |
|------|-------|------|
| `project_count` | Projects | `FolderGit2` |
| `total_chunks` | Chunks indexed | `Database` |
| `pr_reviews_count` | PRs reviewed | `GitPullRequest` |
| `artifacts_count` | Career artifacts | `FileText` |

Loading: skeleton number placeholder (gray bar 60px × 28px, shimmer).
Error: show "—" for each number.

Number count-up animation on load: GSAP `gsap.to(counter, {val: target,
duration: 1.2, ease: "power2.out", onUpdate: () => setText(Math.round(counter.val))})`.
Trigger once on mount.

## Activity feed (right panel)

### Container
`background: --bg-surface`, `border: 1px solid --border`,
`border-radius: --radius-lg`, `padding: 16px`, `height: fit-content`,
`max-height: calc(100vh - 220px)`, `overflow-y: auto`.

### Header
"RECENT ACTIVITY" — `font-size: 10px`, `font-weight: 600`,
`--text-muted`, `text-transform: uppercase`, `letter-spacing: 0.08em`,
`margin-bottom: 12px`.

### Activity items
Each event:
```
● Repo indexed                    5d ago
  Artyuglandingpage-NEXTJS
```
- Dot: 6px circle, color by event type (see below)
- Event label: `font-size: 13px`, `--text-primary`, `font-weight: 500`
- Time: `font-size: 11px`, `--text-muted`, `.mono`, right-aligned
- Project name: `font-size: 12px`, `--text-secondary`, below label
- `padding: 10px 0`, `border-bottom: 1px solid --border-subtle`
- Last item: no border

Event type → dot color + label:
| type | color | label |
|------|-------|-------|
| `indexed` | `--success` | Repo indexed |
| `pr_reviewed` | `--accent` | PR reviewed |
| `artifact_generated` | `--info` | Career artifact generated |
| `diagram_generated` | `--warning` | Diagram generated |
| `health_analyzed` | `--text-muted` | Health analyzed |

### Empty state
```
[Activity icon, 24px, --text-muted]
No activity yet
```

### Stagger animation
Items fade + slide in: `opacity 0→1`, `translateY 4px→0`,
`30ms` stagger, `duration: 180ms`. CSS keyframe, no GSAP needed.

## Project cards — quick actions row
Add a third row inside each card (below the action buttons divider),
only when the project is `ready`:

```
Last PR #4 · Approve ✓     Last artifact: Portfolio
```
- `font-size: 11px`, `--text-muted`
- "Last PR #X" in `.mono` + verdict badge (tiny, 10px)
- "Last artifact: Portfolio/Resume/Interview Prep" if any exist
- Both derived from project data if available in the project list
  response — if not, skip this row silently (no extra API calls
  per card, only use data already fetched)

If `GET /projects` doesn't return this data, add to `ProjectResponse`:
- `last_pr_number: int | null`
- `last_pr_verdict: str | null`
- `last_artifact_type: str | null`
(Single extra JOIN in the list query, not N+1)

## Sidebar — user section

### Bottom of sidebar (above existing user avatar area)
Replace current plain username with full user card:

```
┌──────────────────────────────┐
│ [avatar 32px]  TFD666        │
│                GitHub user   │
│ ──────────────────────────── │
│ ☀ Light  ●────  ● Dark       │  ← theme toggle
│ ──────────────────────────── │
│ ⚙ Settings    [Sign out →]   │
└──────────────────────────────┘
```

**Avatar:** `<img src="https://github.com/${username}.png" width="32"
height="32" style="border-radius: 50%; border: 1px solid var(--border)"/>`

**Username:** `font-size: 13px`, `font-weight: 600`, `--text-primary`
**Subtitle:** "GitHub user" — `font-size: 11px`, `--text-muted`

**Theme toggle:**
`margin-top: 12px`, `border-top: 1px solid --border-subtle`,
`padding-top: 12px`.
Label "Theme" `font-size: 11px`, `--text-muted`.
Toggle: two options "Light" / "Dark" as a pill selector
(same pattern as run selector in PRReview).
Active option: `--accent-subtle` bg, `--accent` text.
On change: toggle `data-theme="light"` on `<html>`. CSS vars already
in `:root` — add a `[data-theme="light"]` override block in tokens.css
that inverts key colors (see light theme overrides below).

**Settings link:** `btn-ghost` small, `Settings` icon + "Settings".
For now: navigates to `/settings` — placeholder route, shows
"Settings coming soon" page. Don't build settings yet.

**Sign out:** `btn-ghost` small, `LogOut` icon + "Sign out",
`--danger` color on hover. Calls `POST /auth/logout`, clears cookie,
redirects to `/`.

### Light theme overrides (tokens.css addition)
```css
[data-theme="light"] {
  --bg-base:       #F8F8FA;
  --bg-surface:    #FFFFFF;
  --bg-subtle:     #F0F0F5;
  --bg-overlay:    #E8E8F0;
  --border:        #E0E0EA;
  --border-subtle: #EBEBF5;
  --text-primary:  #0A0A0F;
  --text-secondary:#4A4A5A;
  --text-muted:    #8A8A9A;
}
```
Accent, semantic colors (success/danger/warning/info) stay same in both
themes. Persist theme choice in `localStorage` — read on app init and
apply `data-theme` before first render to avoid flash.

## What stays the same
- Project card layout, action buttons, status badges, polling logic
- All routing and navigation
- Invite badge in sidebar (just moves above the user section)

## Do not
- Do not make N+1 API calls for quick actions in cards — extend
  ProjectResponse or skip if data not available.
- Do not build full Settings page — placeholder only.
- Do not use a third-party theme library — CSS vars + data-theme attr.
- Do not hardcode colors.
- Do not add more than 4 stat cards — keep it scannable.
