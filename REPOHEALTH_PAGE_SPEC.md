# RepoHealth — Page Spec (UI/UX Overhaul)

## Reference
Read DESIGN_SYSTEM.md first. All tokens apply. No hardcoded hex values.

## Current state
`RepoHealth.jsx` renders a standalone page with an Analyze button,
cooldown state, and two tabs (Hotspots / Stale). All logic, polling,
cooldown enforcement, and permission checks stay untouched.

## Layout
```
┌──────────────────────────────────────────────────────────────────┐
│ Page header (sticky 56px): "Repo Health"                         │
├──────────────────────────────────────────────────────────────────┤
│ Analysis control bar                                              │
├──────────────────────────────────────────────────────────────────┤
│ [Hotspots (N)]  [Stale (N)]                                      │
├──────────────────────────────────────────────────────────────────┤
│ Tab content (file table)                                          │
└──────────────────────────────────────────────────────────────────┘
```
Max content width: `860px`, centered, `padding: 0 32px`.

## Page header
- Title: "Repo Health", `font-size: 20px`, `font-weight: 700`
- Subtitle below title: "Complexity hotspots and stale file detection" —
  `font-size: 13px`, `--text-muted`. Sits below the title, not inline.
- Standard sticky 56px + blur backdrop pattern.

## Analysis control bar
`background: --bg-surface`, `border: 1px solid --border`,
`border-radius: --radius-lg`, `padding: 16px 20px`, `margin: 24px 0`,
flex, `justify-content: space-between`, `align-items: center`.

**Left side — last analyzed info:**
```
Last analyzed 4 minutes ago
Next analysis available in 6m
```
- "Last analyzed X ago": `font-size: 13px`, `--text-secondary`
- Cooldown line: `font-size: 12px`, `--text-muted`
- If never analyzed: "No analysis run yet" — `font-size: 13px`,
  `--text-muted`

**Right side — Analyze button:**
- Idle (owner/editor, no cooldown): `btn-primary`, `Activity` icon +
  "Analyze" label
- On cooldown: `btn-secondary` disabled, `Clock` icon + "Wait Xm" label,
  `opacity: 0.6`, `cursor: not-allowed`
- Analyzing (job running): `btn-secondary` disabled, spinner +
  "Analyzing…" label. Spinner: 14px circle, `border: 2px solid
  --border`, `border-top-color: --accent`, `animation: spin 0.8s
  linear infinite`
- Viewer: replace button with `badge-neutral` "Read only"

**Viewer amber banner:** `ViewerBanner` component above the control bar,
full width. Same as other pages.

## Tab bar
Standard tab pattern. Tab labels include count in parens:
`Hotspots (11)` / `Stale (6)`.
Count in `--text-muted`, `font-size: 13px`.
If count is 0: tab still shows, content shows empty state.

## Hotspots tab

### Table
Full-width table using the design system table pattern.

Column headers:
| FILE | COMPLEXITY* | COMMITS | SCORE |
`*` after COMPLEXITY links to a tooltip or footnote:
"Complexity is a heuristic proxy, not a standard metric."
shown as a `?` icon with title attribute — no custom tooltip component
needed, native browser title is fine.

### Row anatomy
```
backend/app/routers/auth.py        97      2      ████░░░░  50
```
- FILE: `.mono`, `font-size: 12px`, `--text-primary`. Full path.
  Truncate with ellipsis if > 50 chars, show full on hover via
  native `title` attribute.
- COMPLEXITY: `.mono`, `font-size: 13px`, `--text-secondary`,
  right-aligned
- COMMITS: `.mono`, `font-size: 13px`, `--text-secondary`, right-aligned
- SCORE: two parts side by side —
  1. Mini bar: `width: 80px`, `height: 6px`, `background: --bg-subtle`,
     `border-radius: 999px`. Inner fill: `width: {score}%`,
     `background: linear-gradient(90deg, --accent, #C084FC)`,
     `border-radius: 999px`
  2. Score number: `.mono`, `font-size: 13px`, `--text-primary`,
     `margin-left: 8px`, `min-width: 28px`, right-aligned

### Score color coding on the bar
- Score 70-100: fill color → `--danger` gradient
- Score 40-69: fill color → `--warning` gradient
- Score 0-39: fill color → `--accent` gradient
(Use inline style on the fill div, computed from score value)

### Empty state (Hotspots tab, no data)
```
[Activity icon, 32px, --text-muted]
No hotspots found
Run an analysis to see complexity and churn data.
[Analyze →]  ← btn-primary, only for owner/editor
```

## Stale tab

### Table
Column headers:
| FILE | LAST COMMIT |

### Row anatomy
```
.gitignore                          179 days ago
```
- FILE: `.mono`, `font-size: 12px`, `--text-primary`. Same truncation
  as Hotspots tab.
- LAST COMMIT: `font-size: 13px`, `--text-secondary`. Relative date
  ("179 days ago"). Color-code by staleness:
  - > 180 days: `--danger`
  - 90-180 days: `--warning`
  - < 90 days: `--text-secondary` (shouldn't appear given 90-day filter
    but handle gracefully)

### Empty state (Stale tab)
```
[CheckCircle icon, 32px, --success]
No stale files detected
All files have been touched within the last 90 days.
```
Use `--success` color on the icon and title — this is a positive outcome.

## Pre-analysis empty state (no analysis ever run)
Shown instead of tabs when `last_health_analysis_at` is null:
```
[BarChart2 icon, 48px, --text-muted]
Run your first analysis
DevKit AI will surface complexity hotspots and files that
haven't been touched in 90+ days.
[Analyze →]  ← btn-primary, centered, only for owner/editor
```
`padding: 64px 0`, centered.

## Analyzing state (job running)
Keep the tabs visible but replace table content with:
- 5 skeleton rows: `height: 44px`, `background: --bg-subtle`,
  `border-radius: --radius-md`, shimmer animation,
  `margin-bottom: 8px`
- Small text below: `font-size: 12px`, `--text-muted`,
  "Analysis in progress…"

## Animations
- Table rows stagger in on data load: `opacity: 0 → 1`,
  `translateY: 4px → 0`, `50ms` stagger between rows,
  `duration: 200ms`, `ease-out`
- Score bar fill: animates width `0% → actual%` on mount,
  `duration: 600ms`, `ease-out`. GSAP or CSS transition both fine.
- Framer Motion not required here — CSS transitions are sufficient.

## What to keep exactly as-is
- All data fetching and polling logic
- Cooldown calculation and display
- Analyze button enqueue logic
- Permission checks (`useProjectRole`)
- `health_status` polling behavior

## What changes
- Every visual: colors, typography, table styling
- Control bar: redesigned from current layout
- Score visualization: plain number → mini bar + number
- Stale dates: color-coded by staleness age
- Empty states: per the three states above (never run / analyzing /
  no results)
- Row entrance animation on data load

## Do not
- Do not change polling logic or cooldown enforcement.
- Do not replace the native `title` tooltip on the complexity asterisk
  with a custom tooltip component — not worth the complexity for v1.
- Do not add sorting/filtering to the tables — out of scope.
- Do not hardcode colors.
- Do not fold any new features into this pass.
