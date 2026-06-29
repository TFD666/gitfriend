# ArchDiagram — Page Spec (UI/UX Overhaul)

## Reference
Read DESIGN_SYSTEM.md first. All tokens apply. No hardcoded hex values.

## Current state
`ArchDiagram.jsx` renders two diagram panels (System Architecture +
Dependency Graph), each with a Generate button, cooldown state, and
rendered Mermaid output. All logic, polling, cooldown, permission checks,
and mermaid rendering stay untouched.

## Layout
```
┌──────────────────────────────────────────────────────────────────┐
│ Page header (sticky 56px): "Architecture"                        │
├──────────────────────────────────────────────────────────────────┤
│ [System Architecture panel]  [Dependency Graph panel]            │
│ (side by side on desktop, stacked on mobile <900px)              │
└──────────────────────────────────────────────────────────────────┘
```
Max content width: `1100px` (wider than other pages — diagrams need room),
centered, `padding: 24px 32px`.

## Page header
- Title: "Architecture", `font-size: 20px`, `font-weight: 700`
- Subtitle: "AI-generated system diagrams from your indexed codebase" —
  `font-size: 13px`, `--text-muted`
- Standard sticky 56px + blur backdrop

## Two-panel grid
`display: grid`, `grid-template-columns: 1fr 1fr`, `gap: 24px`.
At `< 900px`: `grid-template-columns: 1fr` (stacked).

Each panel is a self-contained card — independent generate, cooldown,
and content state.

## Diagram panel (applies to both System Architecture and Dependency Graph)

### Panel container
`background: --bg-surface`, `border: 1px solid --border`,
`border-radius: --radius-lg`, `overflow: hidden`.
On hover (when diagram exists): `border-color: --border-focus`,
`150ms ease`.

### Panel header
`padding: 16px 20px`, `border-bottom: 1px solid --border-subtle`,
flex, `justify-content: space-between`, `align-items: center`.

**Left:**
```
[GitBranch icon]  System Architecture
                  AI-generated · last run 2d ago
```
- Icon: 16px, `--accent`
- Panel title: `font-size: 14px`, `font-weight: 600`, `--text-primary`
- Meta line: `font-size: 11px`, `--text-muted`.
  "AI-generated · last run Xd ago" when diagram exists.
  "AI-generated" only when never run.

**Right: action buttons**
- Never generated (owner/editor): `btn-primary` small, `Sparkles` icon
  + "Generate"
- Exists + no cooldown (owner/editor): `btn-secondary` small,
  `RefreshCw` icon + "Regenerate"
- On cooldown: `btn-secondary` small disabled, `Clock` icon + "Wait Xm",
  `opacity: 0.5`
- Generating (this panel's job running): spinner + "Generating…",
  `btn-secondary` disabled
- Viewer: no button, nothing (diagram renders read-only)
- Also show "Copy source" button when diagram exists (all roles):
  `btn-ghost` small, `Copy` icon + "Copy". On click: copies
  `mermaid_source` to clipboard, button text flips to "Copied ✓" for
  2s then resets.

### Diagram content area
`padding: 20px`, `min-height: 320px`, flex, `align-items: center`,
`justify-content: center`.

**When diagram exists:**
Rendered Mermaid SVG. The SVG should fill the panel width.
Add `max-height: 480px`, `overflow-y: auto` to keep very tall diagrams
contained. Custom scrollbar applies (already global from MentorChat fix).

Wrap the diagram in a subtle inner container:
`background: --bg-base`, `border-radius: --radius-md`,
`padding: 16px`, `width: 100%`.
This gives the diagram a slight inset effect against the panel surface.

**Generating state:**
Skeleton placeholder: `width: 100%`, `height: 280px`,
`background: --bg-subtle`, `border-radius: --radius-md`,
shimmer animation. Small text below: `font-size: 12px`, `--text-muted`,
"Generating diagram…"

**Never generated (owner/editor):**
```
[GitBranch icon, 32px, --text-muted]
No diagram yet
Generate to see your [system architecture / dependency graph]
[Generate →]  ← btn-primary
```

**Never generated (viewer):**
```
[GitBranch icon, 32px, --text-muted]
No diagram generated yet
Contact the project owner to generate diagrams.
```
(No button for viewers)

**Failed state:**
```
[AlertCircle icon, 24px, --danger]
Generation failed
[Try again →]  ← btn-ghost, --danger color
```

## Viewer state (whole page)
`ViewerBanner` above the two-panel grid. No generate/regenerate buttons
in either panel (as specified above). Diagrams render read-only if they
exist. Copy source button still available (reading existing output is
fine for viewers).

## Copy source interaction
When "Copy" is clicked:
- `navigator.clipboard.writeText(mermaid_source)`
- Button label → "Copied ✓", `color: --success`
- After 2000ms: reset to "Copy" + `--text-secondary`
- Use local `useState` per panel — two panels have independent copy state

## Animations
- Panel entrance on page load: left panel slides in from `translateX(-12px)`,
  right panel from `translateX(12px)`, both `opacity: 0 → 1`,
  `duration: 300ms`, `ease-out`, `delay: 100ms`. CSS only, no GSAP needed.
- Diagram content fade-in when Mermaid renders: `opacity: 0 → 1`,
  `duration: 400ms`, `ease-out`. Wrap the diagram div in a CSS transition.
- Generating → ready: content area cross-fades from skeleton to diagram
  (skeleton fades out, diagram fades in). Use `AnimatePresence` if Framer
  Motion is installed, otherwise CSS transition with a key change.

## What to keep exactly as-is
- All data fetching and polling logic
- Both cooldown calculations (independent per diagram type)
- Mermaid initialization and rendering
- `useProjectRole` and permission checks
- Generate/regenerate API calls

## What changes
- Every visual: colors, spacing, panel layout
- Header area: icon + title + meta + action buttons organized per spec
- Content area: diagram in `--bg-base` inset container
- Copy source: properly styled button with copied feedback state
- Empty states: three distinct states per panel
- Panel entrance animation

## Do not
- Do not change any polling, cooldown, or generation logic.
- Do not add a "download SVG" button — not in scope.
- Do not merge the two panels into a tabbed interface — they stay
  side by side (or stacked on mobile).
- Do not hardcode colors.
- Do not change Mermaid initialization — it's already working.
