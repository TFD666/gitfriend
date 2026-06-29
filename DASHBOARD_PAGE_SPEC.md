# Dashboard — Page Spec (UI/UX Overhaul)

## Reference
Read `DESIGN_SYSTEM.md` before implementing anything. All colors,
typography, spacing, and component patterns come from there. No hardcoded
hex values in this file or in component code.

## Current state (what exists)
`Dashboard.jsx` currently renders:
- A flat list of project cards with status polling (3s interval when any
  project is indexing or pending)
- Per-card action buttons: Team, Health, Diagrams, PR Review
- "Shared" badge for non-owned projects
- "Invites" button in a header area with a count badge
- "Add GitHub account" button
- Feature buttons gated by `is_public`, sharing flags, and `me` query

All of this logic stays. The overhaul is purely visual — don't touch the
data-fetching logic, polling behavior, permission gates, or routing.

## Layout

### Page structure
```
Sidebar (from app shell — already implemented in design system step)
│
└── Main content
    ├── Page header (sticky, 56px)
    │   ├── Left:  "Projects" (h1)
    │   └── Right: [+ Add project] button (primary)
    │
    └── Project grid (2-column, collapses to 1 on narrow)
        ├── Project card (ready)
        ├── Project card (indexing)
        ├── Project card (failed)
        └── ... or empty state
```

The "Invites" notification moves to the Sidebar (bottom, above user
info) — not a floating button in the Dashboard header. The sidebar is
the persistent chrome; transient notifications belong there, not in
page-level headers.

## Project card

### Anatomy
```
┌─────────────────────────────────────────────────────┐
│  repo-name                          ● ready          │
│  owner/repo-name                    indexed 2d ago   │
│  ──────────────────────────────────────────────────  │
│  [Health ↗]  [Diagrams ↗]  [PR Review ↗]  [Team ↗] │
└─────────────────────────────────────────────────────┘
```

**Card container:**
- Background: `--bg-surface`
- Border: `1px solid --border`
- Border-radius: `--radius-lg` (8px)
- Padding: 16px
- On hover: border transitions to `--border-focus` (`150ms ease`)
- No box shadow

**Top row:**
- Left: repo name — `font-size: 15px`, `font-weight: 600`,
  `color: --text-primary`. Just the repo name, not the full path.
- Right: status badge (see states below)

**Second row:**
- Left: full repo path (`owner/repo-name`) — `.mono` class,
  `color: --text-secondary`, `font-size: 12px`
- Right: "indexed Xd ago" or "indexed Xh ago" — `font-size: 12px`,
  `color: --text-muted`. Hidden while indexing.

**Divider:** `1px solid --border-subtle`, `margin: 12px 0`

**Action row:** horizontal flex, `gap: 8px`, wraps on narrow.
Each action is a ghost button (`btn-ghost` from design system) — compact,
`padding: 4px 10px`, `font-size: 12px`. Icon (16px) + label.
Icons: use lucide-react throughout.
  - Health → `Activity` icon
  - Diagrams → `GitBranch` icon
  - PR Review → `GitPullRequest` icon
  - Team → `Users` icon

Action buttons are hidden (not just disabled) when the feature is
unavailable — a card with fewer buttons is cleaner than a card with
greyed-out ones. Exception: Team button always shows for owners.

**"Shared with you" badge:** when `project.user_id !== me.id`, show a
small `badge-accent` badge ("Shared") in the top row, between the repo
name and status badge. Owners see nothing here.

### Status variants

**Ready:**
- Badge: `badge-success` — green dot + "Ready"
- Full card interactive (hover border)
- Action row visible

**Indexing / Pending:**
- Badge: `badge-warning` — pulsing amber dot + "Indexing…"
- Pulsing dot: `animation: pulse 1.5s ease-in-out infinite` on the dot
  only, not the whole badge
- Replace divider + action row with a thin indeterminate progress bar
  (`height: 2px`, `background: --bg-subtle`, inner bar
  `background: --accent`, `width: 40%`, sliding animation
  `1.5s ease-in-out infinite alternate`). No action buttons while indexing.
- Card still hoverable but clicking does nothing

**Failed:**
- Badge: `badge-danger` — red dot + "Failed"
- Replace action row with: `font-size: 12px` error message
  ("Indexing failed — ") + a ghost button "Retry" that triggers
  re-index. Keep it terse.
- Card border: `--danger` tint at 30% opacity on hover (not full danger
  color — subtle signal)

**Pending (queued, not yet started):**
- Same as Indexing visually — amber badge "Queued", indeterminate bar

### Empty state (no projects at all)
Centered in the grid area, uses `EmptyState` component from design system:
```
[GitBranch icon, 32px, --text-muted]
No projects yet
Connect a GitHub repo to get started.
[+ Add project]  ← primary button
```

## Page header detail
```
Projects                                    [+ Add project]
```
- "Projects": `font-size: 20px`, `font-weight: 700`, `--text-primary`
- "+ Add project": `btn-primary`, `Plus` icon + "Add project" label
- Header: `height: 56px`, `padding: 0 24px`, flex, `align-items: center`,
  `justify-content: space-between`
- `border-bottom: 1px solid --border-subtle`
- Sticky top, `backdrop-filter: blur(8px)`, `background: rgba(9,9,11,0.8)`

## Sidebar additions (invites notification)
In the sidebar, below the nav links, add:

```
┌──────────────────┐
│ ● 2 Invites       │  ← only when count > 0
└──────────────────┘
```
- Styled as a nav item but with `badge-accent` count pill on the right
- Clicking navigates to `/invites`
- Polls invite count every 60s (same interval as before, just moved here)
- Disappears entirely when count = 0

## Interaction notes
- The 3s polling while indexing should NOT cause visual jank — React Query
  refetch is background, card animates only the indeterminate bar, nothing
  else re-renders visibly.
- "Add project" opens whatever the current OAuth / add-repo flow is —
  don't change that flow, just wire the new button to it.
- Transition between status states (e.g. indexing → ready) should feel
  smooth: the card's action row fades in (`opacity 0→1, 200ms ease-out`)
  when status becomes ready, not a jarring repaint.

## What to keep exactly as-is
- All data fetching (`useQuery` calls, `refetchInterval` logic)
- All permission/role checks (`me.id`, `project.user_id`, sharing flags)
- All routing (`navigate()` calls on button clicks)
- The polling logic for indexing status

## What changes
- Every visual: colors, typography, spacing, card structure
- The Invites button moves from page header → sidebar
- Action buttons change from the current style to `btn-ghost` compact
- Status indicators change from whatever they are now to the badge +
  dot system above
- Empty state gets the proper `EmptyState` component treatment

## Do not
- Do not change any data fetching, polling, or permission logic.
- Do not add new features or data — this is purely a visual pass.
- Do not use hardcoded colors — only design system tokens.
- Do not put the Invites notification back in the page header.
- Do not show disabled/greyed action buttons — hide unavailable ones.
- Do not add box shadows to cards.
- Do not use border-radius > 8px on cards.
