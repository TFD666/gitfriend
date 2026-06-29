# MentorChat — Page Spec (UI/UX Overhaul)

## Reference
Read DESIGN_SYSTEM.md first. All tokens apply. No hardcoded hex values.

## Current state
`MentorChat.jsx` currently renders a single-column chat view with a
message list and input at the bottom. Citation chips trigger inline file
summaries. PR summary panel is a collapsible section. Viewer banner shows
for read-only users. All of this logic stays untouched — visual only.

## Layout — Split panel

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (app shell)  │ Context panel (280px) │ Chat panel (flex)│
│                      │                        │                  │
│                      │ Project info           │ Message list     │
│                      │ ────────────────────── │                  │
│                      │ Recent citations       │                  │
│                      │ (files mentioned in    │                  │
│                      │  this session)         │                  │
│                      │ ────────────────────── │                  │
│                      │ PR Summary panel       │                  │
│                      │                        │ ──────────────── │
│                      │                        │ Input bar        │
└─────────────────────────────────────────────────────────────────┘
```

**Context panel (left, 280px fixed):**
- Background: `--bg-surface`
- Right border: `1px solid --border`
- Full height, non-scrollable outer, inner sections scroll independently
- No collapse on desktop — always visible

**Chat panel (right, flex-1):**
- Background: `--bg-base`
- Contains: sticky page header (56px), scrollable message list, pinned
  input bar at bottom

## Page header (inside chat panel, sticky)
```
← Dashboard    devkit-ai / project-name         [viewer badge if applicable]
```
- Height: 56px, `border-bottom: 1px solid --border-subtle`
- Left: back arrow (`ArrowLeft` icon) + project name in `.mono`
- Right: viewer badge if `role === 'viewer'` — `badge-neutral` "Read only"
- `backdrop-filter: blur(8px)`, `background: rgba(9,9,11,0.8)`

## Context panel content

### Section 1 — Project info
`padding: 16px`, `border-bottom: 1px solid --border-subtle`

```
devkit-ai/project-name          ● Ready
owner/repo-name                 247 chunks indexed
```
- Project name: `font-size: 14px`, `font-weight: 600`, `--text-primary`
- Status badge: `badge-success` small
- Repo path: `.mono`, `--text-secondary`, `font-size: 12px`
- Chunk count: `.mono`, `--text-muted`, `font-size: 11px`

### Section 2 — Citations this session
`padding: 12px 16px`, `border-bottom: 1px solid --border-subtle`

Label: "FILES REFERENCED" — `font-size: 10px`, `font-weight: 500`,
`--text-muted`, `text-transform: uppercase`, `letter-spacing: 0.08em`,
`margin-bottom: 8px`

List of files cited so far in this session. Each entry:
```
↳ backend/app/routers/auth.py
```
- `.mono`, `font-size: 12px`, `--accent` color
- `padding: 4px 0`
- On click: triggers the existing inline file summary expand behavior
- Empty state: `font-size: 12px`, `--text-muted`,
  "No files cited yet — ask a question to get started"
- Max 8 visible, scroll within this section if more

### Section 3 — PR Summary panel
Move the existing PR summary collapsible panel from the main chat area
into the context panel bottom section.
`padding: 12px 16px`

Label: "PR REVIEW" — same style as "FILES REFERENCED" above

PR number input + "Summarize" button — same functionality as before,
restyled to fit the panel width:
- Input: `--bg-subtle`, full width, `border-radius: --radius-md`
- Button: `btn-primary`, full width, `margin-top: 8px`

When a summary exists: render it in a scrollable box within this section,
`max-height: 200px`, `font-size: 12px`, `--text-secondary`,
`line-height: 1.5`.

## Message list (chat panel)

### Container
`padding: 24px 32px`, scrollable, `flex-direction: column`, `gap: 24px`
Messages render bottom-up (newest at bottom). Auto-scrolls to bottom on
new message.

### User message (right-aligned bubble)
```
                    How does the auth flow work? [avatar]
```
- Bubble: `background: --accent`, `color: --text-inverse`,
  `border-radius: 18px 18px 4px 18px`, `padding: 12px 16px`,
  `max-width: 70%`, `font-size: 14px`, `line-height: 1.5`
- Aligned right: `align-self: flex-end`, `flex-direction: row-reverse`
- Avatar: 28px circle, `background: --accent-dim`,
  initials or GitHub avatar if available

### AI message (left-aligned bubble)
```
[DK]  The auth flow uses GitHub OAuth...
      ↳ backend/app/routers/auth.py   ↳ backend/app/services/encryption.py
```
- Bubble: `background: --bg-surface`, `border: 1px solid --border`,
  `border-radius: 18px 18px 18px 4px`, `padding: 16px`,
  `max-width: 80%`, `font-size: 14px`, `line-height: 1.6`
- Avatar: 28px circle, `background: --accent-subtle`,
  "DK" initials in `--accent`, `font-family: mono`, `font-size: 11px`
- Message text: `--text-primary`
- Citation chips (below text, `margin-top: 10px`, `gap: 6px`):
  `background: --accent-subtle`, `border: 1px solid --accent-dim`,
  `border-radius: --radius-sm`, `padding: 3px 8px`,
  `.mono`, `font-size: 11px`, `--accent` color,
  `↳` prefix before filename. On click: existing inline expand behavior.

### Streaming state
While AI is generating: show the AI bubble with a pulsing ellipsis
`● ● ●` in `--accent` color, `animation: pulse 1s ease-in-out infinite`
on each dot with staggered delay (0ms, 150ms, 300ms). Replace with
actual content as it streams in.

### Empty state (no messages yet)
Centered in the message list area:
```
[MessageSquare icon, 32px, --text-muted]
Ask anything about your codebase
Try: "How does authentication work?" or "What does X function do?"
[suggestion chips]
```
Suggestion chips: `background: --bg-subtle`, `border: 1px solid --border`,
`border-radius: 20px`, `padding: 6px 14px`, `font-size: 13px`,
`--text-secondary`. On click: pre-fill the input.
Keep existing suggestion chip logic, just restyle.

## Input bar (pinned bottom of chat panel)
`padding: 16px 32px`, `border-top: 1px solid --border-subtle`,
`background: --bg-base`

```
┌─────────────────────────────────────────────── [↑ Send] ┐
│ Ask anything about your codebase...                      │
└──────────────────────────────────────────────────────────┘
```

- Textarea (not input): auto-grows up to 5 lines, then scrolls
- `background: --bg-subtle`, `border: 1px solid --border`,
  `border-radius: 12px`, `padding: 12px 16px`, `font-size: 14px`,
  `resize: none`
- On focus: `border-color: --border-focus`,
  `box-shadow: 0 0 0 2px rgba(124,106,245,0.15)`
- Send button: inside the textarea container, bottom-right,
  `background: --accent`, `border-radius: 8px`, `padding: 6px 8px`,
  `ArrowUp` icon, 16px. Disabled + `opacity: 0.4` when input empty
  or while streaming.
- Viewer state: entire input bar replaced by ViewerBanner component

## Viewer state
If `role === 'viewer'`:
- Input bar → replaced by ViewerBanner ("Read-only — viewer access...")
- PR summary input → disabled, greyed
- Citation chips still clickable (read-only is fine for viewing summaries)
- Message history renders normally

## Animations
- New message entering: `opacity: 0 → 1`, `translateY: 8px → 0`,
  `duration: 200ms`, `ease-out`. Apply to both user and AI bubbles.
- Citation chips appearing: stagger `50ms` between chips,
  same fade+slide treatment
- Framer Motion `AnimatePresence` for message list if already installed,
  otherwise CSS transition is fine

## What to keep exactly as-is
- All data fetching, SSE streaming, citation logic
- PR summarization API calls
- Viewer permission checks
- Suggestion chip click handlers
- Auto-scroll-to-bottom behavior
- The `useProjectRole` hook usage

## What changes
- Layout: single column → split panel
- Messages: unstyled → bubble style per above
- PR panel: moves from main chat → context panel left side
- Citations sidebar: new section in context panel (file list derived
  from existing citation data already in state)
- Input: restyled textarea with send button inside
- Streaming indicator: existing "..." → pulsing dot animation

## Do not
- Do not change any API calls, SSE handling, or state management.
- Do not move the citation expand/collapse logic — just restyle the chips.
- Do not add new data sources to the context panel — only use data
  already available in the component (project info, citations from
  current session messages).
- Do not hardcode colors.
- Do not add the file tree (it was in the layout option name but there
  is no file tree data available — use citations as the left panel
  content instead, as specced above).
