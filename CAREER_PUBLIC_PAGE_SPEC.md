# CareerMode + PublicProject + PublicProfile — Page Specs (UI/UX Overhaul)

These three pages share a design language — they're all about presenting
a developer's portfolio work. CareerMode is where artifacts are generated;
PublicProject and PublicProfile are what recruiters see. All three get
extra polish compared to the tool-facing pages.

Read DESIGN_SYSTEM.md first. No hardcoded hex values anywhere.

---

# 1. CareerMode.jsx

## Current state
Tabs for Portfolio / Resume Bullets / Interview Prep, generate button per
tab, publish toggle with public URL. All logic stays untouched.

## Layout
```
┌──────────────────────────────────────────────────────────────────┐
│ Page header (sticky 56px): "Career Mode"    [↗ View public page] │
├──────────────────────────────────────────────────────────────────┤
│ Publish panel (owner only)                                        │
├──────────────────────────────────────────────────────────────────┤
│ [Portfolio]  [Resume Bullets]  [Interview Prep]   [Generate ↻]   │
├──────────────────────────────────────────────────────────────────┤
│ Artifact content area (scrollable)                                │
└──────────────────────────────────────────────────────────────────┘
```

Max content width: `800px`, centered in the main area, `padding: 0 32px`.

## Page header
- Title: "Career Mode", `font-size: 20px`, `font-weight: 700`
- Right: "View public page ↗" ghost button — only visible when
  `is_public: true`. Opens public URL in new tab.
- Standard sticky header pattern from design system (56px, blur backdrop)

## Publish panel (owner only, above tabs)
```
┌────────────────────────────────────────────────────────┐
│ 🌐 Public page   [toggle]   /u/username/project-slug   [Copy ↗] │
└────────────────────────────────────────────────────────┘
```
- `background: --bg-surface`, `border: 1px solid --border`,
  `border-radius: --radius-lg`, `padding: 12px 16px`
- `margin-bottom: 20px`
- Left: `Globe` icon (16px, `--text-muted`) + "Public page" label
  (`font-size: 13px`, `--text-secondary`)
- Center: toggle switch (CSS toggle, existing logic)
- Right (when enabled): public URL in `.mono`, `font-size: 12px`,
  `--accent` color + copy button (`Copy` icon, `btn-ghost` small)
- Warning text below when toggled on: `font-size: 12px`,
  `--text-muted`, "Anyone with this link can view your portfolio"
- Hidden entirely for non-owners (viewer/editor see nothing here)

## Tab bar
Tabs: Portfolio | Resume Bullets | Interview Prep
Standard tab pattern from design system.
Right of tabs (same row, pushed right): Generate button.
- `btn-primary` when idle: "Generate" with `Sparkles` icon
- `btn-primary` when loading: "Generating…" with spinner, disabled
- `btn-secondary` when artifact exists: "Regenerate" with `RefreshCw` icon
- Hidden for viewers

## Artifact content area

### Portfolio tab
Renders the portfolio summary as formatted prose:
- Wrap in a card (`--bg-surface`, border, `border-radius: --radius-lg`,
  `padding: 24px`)
- `font-size: 14px`, `line-height: 1.8`, `--text-primary`
- Section headings (if any in the content) styled as `font-size: 13px`,
  `font-weight: 600`, `--text-secondary`, `text-transform: uppercase`,
  `letter-spacing: 0.05em`, `margin: 20px 0 8px`

### Resume Bullets tab
Renders as a styled bullet list:
- Each bullet: `padding: 8px 0`, `border-bottom: 1px solid --border-subtle`
- Bullet marker: `--accent` colored `▸` character, `font-size: 12px`
- Text: `font-size: 14px`, `--text-primary`, `line-height: 1.5`
- Last bullet: no border

### Interview Prep tab
Q&A format — if the content has Q: / A: structure, render as:
- Question: `--bg-subtle` bg, `border-left: 3px solid --accent`,
  `padding: 10px 14px`, `font-size: 14px`, `font-weight: 500`
- Answer: `padding: 10px 14px 20px`, `font-size: 14px`,
  `--text-secondary`, `line-height: 1.6`
- If content is plain prose, render same as Portfolio tab.

### Empty state (no artifact yet)
For each tab when no artifact exists:
```
[Sparkles icon, 32px, --text-muted]
No [Portfolio/Resume Bullets/Interview Prep] generated yet
Click Generate to create one  ← hidden for viewers
```

### Viewer state
ViewerBanner at top of content area. Generate button hidden.
Content renders read-only (same as owner but no actions).

---

# 2. PublicProject.jsx

## What it is
Recruiter-facing page at `/u/:username/:slug`. No login required.
No app shell (no sidebar). This is the page that goes on a resume.

## Layout
```
┌────────────────────────────────────────┐
│ Nav bar (minimal)                       │
├────────────────────────────────────────┤
│ Project hero                            │
├────────────────────────────────────────┤
│ Career tabs content                     │
├────────────────────────────────────────┤
│ Diagrams (if diagrams_shared)           │
├────────────────────────────────────────┤
│ Footer                                  │
└────────────────────────────────────────┘
```
Max content width: `760px`, centered, `padding: 0 24px`.

## Nav bar (minimal, not the app sidebar)
`height: 48px`, `border-bottom: 1px solid --border-subtle`,
`background: rgba(9,9,11,0.9)`, `backdrop-filter: blur(8px)`, sticky.
```
[Logo icon] DevKit AI          ← /u/:username (back to profile)
```
Logo links back to `/u/:username` (the profile page).
No sign-in button here — this is a pure public page.

## Project hero
`padding: 48px 0 32px`, `border-bottom: 1px solid --border-subtle`.

```
owner/repo-name                          [↗ GitHub]
Project description (from portfolio summary first 120 chars)
Published Jan 2025  ·  3 artifacts
```

- Repo path: `font-size: 28px`, `font-weight: 700`, `--text-primary`
  The owner part (`owner/`) in `--text-muted`, repo name in
  `--text-primary`. NOT monospace — this is the hero heading.
- GitHub link: `btn-secondary` small, `Github` SVG icon + "View repo",
  opens in new tab. Right-aligned.
- Description: `font-size: 15px`, `--text-secondary`, `line-height: 1.6`,
  `margin-top: 12px`, `max-width: 580px`. Truncated at 120 chars with
  ellipsis.
- Meta row: `font-size: 12px`, `--text-muted`, `margin-top: 12px`.
  "Published [date] · [N] artifacts" — date in relative format
  ("3 months ago"), artifact count is however many exist.

## Career content tabs
Same tab pattern as CareerMode but read-only, no generate button.
Tabs: Portfolio | Resume Bullets | Interview Prep
Only show tabs that have actual artifact content — if Interview Prep
wasn't generated, don't show that tab.

Content rendering: same as CareerMode spec above (formatted prose,
bullet list, Q&A). `padding-top: 32px`.

## Diagrams section (conditional)
Only renders if diagram artifacts exist in the API response.
`padding: 40px 0`, `border-top: 1px solid --border-subtle`.

Section heading: "Architecture" — `font-size: 18px`, `font-weight: 700`,
`margin-bottom: 24px`.

Two diagram cards side by side (stack on mobile):
Each card: `--bg-surface`, `border: 1px solid --border`,
`border-radius: --radius-lg`, `padding: 20px`.
- Card title: "System Architecture" / "Dependency Graph" —
  `font-size: 13px`, `font-weight: 600`, `--text-secondary`,
  `text-transform: uppercase`, `letter-spacing: 0.05em`, `margin-bottom: 12px`
- Rendered Mermaid diagram below
- No "Copy source" button on public page (keep it clean)

## Footer
`padding: 24px 0`, `border-top: 1px solid --border-subtle`, flex,
`justify-content: space-between`.
- Left: "Built with DevKit AI" — `font-size: 12px`, `--text-muted`
- Right: "← Back to @username's profile" link in `--accent`,
  `font-size: 12px`, links to `/u/:username`

## States
- Loading: skeleton placeholders for hero + content (gray shimmer bars)
- 404: centered "Project not found" with back link to `/u/:username`
- No artifacts yet: "No portfolio content generated yet" empty state

---

# 3. PublicProfile.jsx

## What it is
Developer portfolio index at `/u/:username`. Lists all published projects.
No login required. No app shell.

## Layout
```
┌────────────────────────────────────────┐
│ Nav bar (same as PublicProject)         │
├────────────────────────────────────────┤
│ Profile hero                            │
├────────────────────────────────────────┤
│ Project cards grid                      │
├────────────────────────────────────────┤
│ Footer                                  │
└────────────────────────────────────────┘
```
Max content width: `760px`, centered.

## Profile hero
`padding: 48px 0 40px`.
```
@Sleeping_bear
GitHub developer · N projects published
[GitHub ↗]
```
- Username: `@username` — `font-size: 32px`, `font-weight: 700`,
  `--text-primary`. The `@` in `--text-muted`, username in
  `--text-primary`.
- Subtitle: "GitHub developer · N projects" — `font-size: 15px`,
  `--text-secondary`, `margin-top: 8px`
- GitHub button: `btn-secondary` small, below subtitle, `margin-top: 16px`
  Links to `https://github.com/:username`
- Thin `--accent` colored line (`height: 2px`, `width: 40px`) above
  the username as a visual accent. `margin-bottom: 16px`.

## Project cards grid
`padding: 40px 0`, single column (no grid — projects are substantial
enough to deserve full width), `gap: 16px`.

### Project card
```
┌───────────────────────────────────────────────────────┐
│ owner/repo-name                    Published 3mo ago   │
│ Portfolio summary excerpt (first 100 chars)            │
│                                                        │
│ [Portfolio] [Resume] [Interview]    [View project →]   │
└───────────────────────────────────────────────────────┘
```
- Container: `--bg-surface`, `border: 1px solid --border`,
  `border-radius: --radius-lg`, `padding: 20px 24px`
- On hover: `border-color: --border-focus`, `150ms ease`
- Repo name: `font-size: 16px`, `font-weight: 600`, `--text-primary`
- Published date: `font-size: 12px`, `--text-muted`, `.mono`,
  right-aligned
- Description: `font-size: 13px`, `--text-secondary`,
  `line-height: 1.5`, `margin: 8px 0 16px`
- Artifact badges: `badge-neutral` for each artifact type that exists
  ("Portfolio", "Resume", "Interview Prep") — `font-size: 11px`
- "View project →" button: `btn-ghost` small, right-aligned,
  navigates to `/u/:username/:slug`

### Empty state (user exists, zero published projects)
```
[FileText icon, 32px, --text-muted]
No published projects yet
```
`font-size: 14px`, `--text-secondary`. Centered. Not an error.

## Footer
Same as PublicProject footer but without the "Back to profile" link.
- "Built with DevKit AI" left
- Right: nothing (already on the profile)

## States
- Loading: skeleton for hero + 2 card placeholders
- 404 (username doesn't exist): "Profile not found" centered,
  `font-size: 16px`, `--text-secondary`

---

## Shared implementation notes

- All three pages use the same minimal nav bar component — extract as
  `PublicNav.jsx`, takes `username` prop, renders logo + back link.
- All three pages use the same footer pattern — extract as
  `PublicFooter.jsx`, takes optional `username` prop for the back link.
- Mermaid rendering in PublicProject uses the same mermaid.js init
  pattern already in ArchDiagram.jsx — reuse, don't re-implement.
- `prefers-reduced-motion` applies to any skeleton shimmer animations.

## Do not
- Do not add login prompts, sign-in CTAs, or app chrome to public pages.
- Do not show generate/regenerate buttons on any public page.
- Do not add the app sidebar to these pages.
- Do not show the publish toggle on public pages — it's owner-only and
  only lives in the authenticated CareerMode.jsx.
- Do not hardcode colors.
- Do not add new API endpoints — use what already exists.
