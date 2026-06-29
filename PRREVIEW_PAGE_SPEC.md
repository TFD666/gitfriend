# PRReview — Page Spec (UI/UX Overhaul)

## Reference
Read DESIGN_SYSTEM.md first. All tokens apply. No hardcoded hex values.

## Current state
`PRReview.jsx` renders a PR number input, history list of reviewed PRs,
and a drill-down view showing all runs for a PR with verdict, summary,
and inline comments. "Post to GitHub" button per run (owner only).
All logic, polling, API calls, and permission checks stay untouched.

## Layout
```
┌──────────────────────────────────────────────────────────────────┐
│ Page header (sticky 56px): "PR Review"                           │
├──────────────────────────────────────────────────────────────────┤
│ Split: History sidebar (280px) │ Main content (flex-1)           │
│                                │                                  │
│ PR history list                │ [No PR selected]                 │
│                                │ or                               │
│                                │ [PR detail — runs + comments]    │
└──────────────────────────────────────────────────────────────────┘
```
Max content width: full width inside the app shell. No centered column —
this page benefits from the full width for the split layout.

## Page header
- Title: "PR Review", `font-size: 20px`, `font-weight: 700`
- Subtitle: "RAG-augmented code review with inline comments" —
  `font-size: 13px`, `--text-muted`
- Standard sticky 56px + blur backdrop

## Split layout

### History sidebar (left, 280px fixed)
`background: --bg-surface`, `border-right: 1px solid --border`,
`height: 100%`, overflow-y scroll.

**Submit new review (owner only, top of sidebar):**
```
┌─────────────────────────────┐
│ PR #  [___________] [Review]│
└─────────────────────────────┘
```
`padding: 16px`, `border-bottom: 1px solid --border-subtle`.
- Label "PR #": `font-size: 12px`, `--text-muted`, `font-weight: 500`
- Input: number input, spinner removed, `--bg-subtle` bg,
  `border: 1px solid --border`, `border-radius: --radius-md`,
  `padding: 6px 10px`, `font-size: 13px`, `width: 80px`
- "Review" button: `btn-primary` small, `Sparkles` icon, full behavior
  per existing logic
- While reviewing (polling): button disabled + spinner +
  "Reviewing…" label
- Viewer: entire submit block hidden

**PR history list:**
Each reviewed PR as a list item:
```
#7  Update landing page APK link    ✓ approve
    2 runs · last 3d ago
```
- `padding: 12px 16px`, `cursor: pointer`
- On hover: `background: --bg-subtle`
- Active (selected): `background: --accent-subtle`,
  `border-left: 2px solid --accent`
- PR number: `.mono`, `font-size: 13px`, `font-weight: 600`,
  `--text-primary`, `margin-right: 8px`
- PR title: `font-size: 13px`, `--text-primary`, truncated at 1 line
- Verdict badge (latest run): `badge-success` for approve,
  `badge-danger` for request_changes, `badge-warning` for comment.
  Small, right-aligned on the first row.
- Meta row: `font-size: 11px`, `--text-muted`, "N runs · last Xd ago"
- `border-bottom: 1px solid --border-subtle` between items

**Empty history state:**
```
[GitPullRequest icon, 28px, --text-muted]
No reviews yet
Enter a PR number above to get started.
```
Centered in the sidebar below the input. Only for owner/editor.
For viewers with no history: same but without the "Enter a PR number"
line.

### Main content (right, flex-1)

#### No PR selected state
Centered in the main area:
```
[GitPullRequest icon, 40px, --text-muted]
Select a PR to view its review
or enter a PR number to start a new review
```
`--text-muted`, `font-size: 14px`.

#### PR detail view
When a PR is selected from the history list:

**Detail header:**
`padding: 20px 24px`, `border-bottom: 1px solid --border-subtle`.
```
#7  Update landing page APK link          [↗ View on GitHub]
    2 runs  ·  Last reviewed 3 days ago
```
- PR number: `.mono`, `font-size: 24px`, `font-weight: 700`, `--accent`
- PR title: `font-size: 18px`, `font-weight: 600`, `--text-primary`,
  `margin-left: 12px`
- "View on GitHub" button: `btn-ghost` small, external link icon,
  links to `https://github.com/{owner}/{repo}/pull/{pr_number}`
- Meta: `font-size: 12px`, `--text-muted`, below the title row

**Run selector (if multiple runs):**
`padding: 12px 24px`, `border-bottom: 1px solid --border-subtle`.
Horizontal pill selector — each run as a selectable pill:
```
[Run #1]  [Run #2 ●]  [Run #3]
```
- Pill: `padding: 4px 12px`, `border-radius: 999px`,
  `border: 1px solid --border`, `font-size: 12px`, `.mono`,
  `--text-secondary`, `cursor: pointer`
- Active pill: `background: --accent-subtle`,
  `border-color: --accent`, `color: --accent`
- Newest run indicator: small filled dot after the run number

**Run detail:**
`padding: 24px`, scrollable.

*Verdict + summary card:*
```
┌──────────────────────────────────────────────────────┐
│ ✓ APPROVE  ·  Run #2  ·  2d ago    [Post to GitHub ↗]│
│                                                       │
│ This PR updates Google Drive links across the         │
│ codebase from direct-download format to preview...    │
└──────────────────────────────────────────────────────┘
```
- Container: `--bg-surface`, `border: 1px solid --border`,
  `border-radius: --radius-lg`, `padding: 20px`, `margin-bottom: 20px`
- Verdict badge: large — `badge-success`/`badge-danger`/`badge-warning`
  with checkmark/X/message icon. `font-size: 13px`, `font-weight: 600`,
  `padding: 4px 10px`
- Run meta inline: `.mono`, `font-size: 12px`, `--text-muted`
- "Post to GitHub ↗": `btn-secondary` small, owner only, right-aligned.
  If already posted (`github_posted: true` on all comments):
  replace with `badge-success` "Posted to GitHub ✓"
- Summary text: `font-size: 14px`, `--text-secondary`, `line-height: 1.6`,
  `margin-top: 12px`

*Inline comments list:*
Section heading: "INLINE COMMENTS (N)" — `font-size: 11px`,
`font-weight: 500`, `--text-muted`, `text-transform: uppercase`,
`letter-spacing: 0.08em`, `margin-bottom: 12px`.

Each comment:
```
┌──────────────────────────────────────────────────────┐
│ [ISSUE]  components/hero-section.tsx  line 121        │
│                                                       │
│ Consider extracting this download URL to a            │
│ configuration constant rather than hardcoding it      │
│ in the component...                                   │
└──────────────────────────────────────────────────────┘
```
- Container: `--bg-surface`, `border: 1px solid --border`,
  `border-left: 3px solid {type-color}`, `border-radius: --radius-md`,
  `padding: 14px 16px`, `margin-bottom: 10px`
- Left border color by comment_type:
  - `issue` → `--danger`
  - `suggestion` → `--info`
  - `praise` → `--success`
  - `nitpick` → `--text-muted`
- Type badge: `badge-danger`/`badge-info`/`badge-success`/`badge-neutral`
  (small, 11px), inline before file path
- File path: `.mono`, `font-size: 12px`, `--text-secondary`
- Line number: `.mono`, `font-size: 12px`, `--text-muted`,
  "line 121" — null line number shows nothing
- Body: `font-size: 13px`, `--text-primary`, `line-height: 1.6`,
  `margin-top: 10px`

**Comment entrance animation:**
Comments stagger in on run load: `opacity: 0 → 1`,
`translateY: 6px → 0`, `40ms` stagger, `duration: 200ms`, `ease-out`.

## Viewer state
ViewerBanner above the split layout. Submit block hidden in sidebar.
History list visible — viewer can read existing reviews.
"Post to GitHub" button hidden.

## While reviewing (polling state)
The selected PR's detail view (or empty state if no PR was previously
selected) shows a subtle top progress bar (`ProgressBar` component,
`loading={true}`) at the top of the main content area.
Sidebar submit button shows "Reviewing…" spinner.

## States
- No PR selected: centered empty state in main content
- Loading PR detail: skeleton — title bar skeleton, 3 comment skeletons
- PR not found in history: shouldn't happen (can only select from list)
- Error fetching runs: `AlertCircle` + "Failed to load review" +
  retry button

## Animations
- Sidebar PR items stagger in on history load: same 40ms stagger pattern
- Comment stagger on run select (as above)
- Run selector pill transition: `background` and `border-color` CSS
  transition `150ms ease`

## What to keep exactly as-is
- All polling logic while review job runs
- PR history list fetching
- Run selection state
- "Post to GitHub" API call and `github_posted` tracking
- `useProjectRole` and permission checks

## What changes
- Layout: single column → split sidebar + main content
- PR history items: restyled with verdict badge + meta
- Run selector: new pill UI (was probably a dropdown or list)
- Verdict + summary: card with large verdict badge
- Comments: left-border color coding by type
- All empty/loading/error states

## Do not
- Do not change any polling, API, or mutation logic.
- Do not add syntax highlighting to comment body text.
- Do not add a diff view — out of scope.
- Do not hardcode colors.
- Do not merge runs into a single flat list — run selector stays
  as a separate UI element above the run detail.
