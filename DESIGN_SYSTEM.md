# DevKit AI — Design System Spec

## Vision
A dark, precise developer tool. The aesthetic should feel like it belongs
alongside Linear and Vercel — data-dense, confident, no decorative excess.
Every metric, identifier, and file path renders in monospace. That
consistency is the signature: a tool built by developers, for developers.

## Token system

### Color palette
All colors as CSS custom properties on `:root`. Tailwind config extends
these via `var(--*)` references — do NOT hardcode hex values in components.

```css
:root {
  /* Base surfaces */
  --bg-base:       #09090B;   /* page background */
  --bg-surface:    #111113;   /* card / panel background */
  --bg-subtle:     #18181B;   /* hover, input, secondary surface */
  --bg-overlay:    #1C1C1F;   /* modal, dropdown overlay */

  /* Borders */
  --border:        #27272A;   /* default border */
  --border-subtle: #1E1E21;   /* dividers, table rows */
  --border-focus:  #7C6AF5;   /* focused input outline */

  /* Text */
  --text-primary:   #FAFAFA;  /* headings, primary content */
  --text-secondary: #A1A1AA;  /* labels, metadata, captions */
  --text-muted:     #52525B;  /* placeholders, disabled */
  --text-inverse:   #09090B;  /* text on accent bg */

  /* Accent — violet-indigo */
  --accent:         #7C6AF5;  /* primary interactive */
  --accent-hover:   #6D5CE6;  /* hover state */
  --accent-subtle:  #1A1730;  /* tinted background (badges, highlights) */
  --accent-dim:     #4C4280;  /* muted accent (secondary badges) */

  /* Semantic */
  --success:        #10B981;  /* approve, ready, active */
  --success-subtle: #0D2B20;
  --warning:        #F59E0B;  /* stale, pending, cooldown */
  --warning-subtle: #2A1F08;
  --danger:         #F43F5E;  /* error, request_changes, failed */
  --danger-subtle:  #2A0F18;
  --info:           #3B82F6;  /* suggestion, info */
  --info-subtle:    #0F1D36;

  /* Monospace accent — applies to all data identifiers */
  --mono-color:     #C4B5FD;  /* file paths, PR numbers, scores in mono */

  /* Radius */
  --radius-sm:  4px;
  --radius-md:  6px;
  --radius-lg:  8px;
  --radius-xl:  12px;

  /* Shadow */
  --shadow-sm:  0 1px 2px rgba(0,0,0,0.5);
  --shadow-md:  0 4px 12px rgba(0,0,0,0.4);
}
```

### Typography
Import via Google Fonts in `index.html`. Two faces only:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
/* Base */
body {
  font-family: 'Geist', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-base);
}

/* Monospace — THE signature element of this design.
   Apply to: file paths, PR numbers, slugs, scores, commit counts,
   chunk citations, GitHub usernames, line numbers, health scores,
   diagram labels, run numbers. Anything that is a datum or identifier. */
.mono {
  font-family: 'Geist Mono', monospace;
  font-size: 12px;
  color: var(--mono-color);
  letter-spacing: -0.01em;
}

/* Type scale */
.text-xs    { font-size: 11px; }
.text-sm    { font-size: 13px; }
.text-base  { font-size: 14px; }
.text-lg    { font-size: 16px; }
.text-xl    { font-size: 20px; }
.text-2xl   { font-size: 24px; }
.text-3xl   { font-size: 30px; }
```

### Spacing
4px base grid. Common values: 4, 8, 12, 16, 20, 24, 32, 48, 64px.
Use Tailwind spacing utilities (`p-2`, `gap-3`, etc.) — they map cleanly.
Compact by default: most card padding is 16px, most section gaps are 24px.

## Layout

### App shell (authenticated pages)
Fixed left sidebar (220px) + scrollable main content. No top navbar.

```
┌─────────────────────────────────────────────────────┐
│ sidebar (220px fixed)  │ main content (flex-1)       │
│                        │                             │
│  logo                  │  page header (sticky)       │
│  nav links             │  ─────────────────────      │
│  ─────────────         │  page content               │
│  project selector      │                             │
│  ─────────────         │                             │
│  user + invite badge   │                             │
└─────────────────────────────────────────────────────┘
```

Sidebar background: `--bg-surface`. Main: `--bg-base`.
Sidebar nav links: 36px height, 12px horizontal padding, 6px radius on
hover/active, active state gets `--accent-subtle` bg + `--accent` text.

### Page header (inside main, sticky top)
```
┌─────────────────────────────────────────────────────┐
│ Page title          [secondary action] [primary CTA] │
│ Subtitle / breadcrumb                                │
└─────────────────────────────────────────────────────┘
```
Height: 56px. Bottom border: `--border-subtle`. Background: `--bg-base`
with `backdrop-filter: blur(8px)` for content scroll-through effect.

### Public pages (no sidebar)
Centered content column, max-width 720px, `--bg-base` background.
Simple top bar: logo left, optional link right. No app chrome.

## Components

### Card
```css
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
}
.card:hover { border-color: var(--border-focus); } /* only on interactive cards */
```

### Button
```css
/* Primary */
.btn-primary {
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

/* Secondary */
.btn-secondary {
  background: var(--bg-subtle);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: 13px;
}

/* Ghost */
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: 13px;
}
.btn-ghost:hover { background: var(--bg-subtle); color: var(--text-primary); }

/* Destructive */
.btn-danger {
  background: var(--danger);
  color: #fff;
  border-radius: var(--radius-md);
  padding: 6px 14px;
  font-size: 13px;
}
```

### Badge / status pill
Small, monospace-adjacent, no border-radius > 4px for data badges.

```css
.badge           { font-size: 11px; font-weight: 500; padding: 2px 6px;
                   border-radius: var(--radius-sm); }
.badge-accent    { background: var(--accent-subtle); color: var(--accent); }
.badge-success   { background: var(--success-subtle); color: var(--success); }
.badge-warning   { background: var(--warning-subtle); color: var(--warning); }
.badge-danger    { background: var(--danger-subtle); color: var(--danger); }
.badge-info      { background: var(--info-subtle); color: var(--info); }
.badge-neutral   { background: var(--bg-subtle); color: var(--text-secondary); }
```

### Input / form
```css
.input {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  width: 100%;
}
.input:focus { border-color: var(--border-focus);
               box-shadow: 0 0 0 2px rgba(124,106,245,0.15); }
.input::placeholder { color: var(--text-muted); }
```

### Table (for file lists, member rosters, etc.)
```css
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th { color: var(--text-muted); font-weight: 500; font-size: 11px;
             text-transform: uppercase; letter-spacing: 0.05em;
             padding: 8px 12px; text-align: left;
             border-bottom: 1px solid var(--border); }
.table td { padding: 10px 12px; border-bottom: 1px solid var(--border-subtle);
             color: var(--text-primary); }
.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: var(--bg-subtle); }
```

### Tab bar
```css
.tabs { display: flex; border-bottom: 1px solid var(--border); gap: 0; }
.tab  { padding: 10px 16px; font-size: 13px; font-weight: 500;
         color: var(--text-secondary); border-bottom: 2px solid transparent;
         cursor: pointer; margin-bottom: -1px; }
.tab:hover  { color: var(--text-primary); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
```

### Empty state
```css
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 48px 24px; text-align: center; gap: 12px;
}
.empty-state-icon  { color: var(--text-muted); }  /* 32px icon */
.empty-state-title { font-size: 15px; font-weight: 600; }
.empty-state-desc  { font-size: 13px; color: var(--text-secondary);
                     max-width: 320px; }
```

### Status / loading
- Loading: a 2px accent-colored top progress bar (like Linear/GitHub),
  not a spinner. `width` animates 0→70% while loading, jumps to 100%
  on complete. Component: `<ProgressBar loading={bool} />`.
- Polling state: subtle pulsing dot next to status text, not a full
  spinner overlay.
- Toast/notification: bottom-right, slide-up animation, auto-dismiss
  4s. Success = `--success` left border, error = `--danger` left border.

### Viewer / role banners
Amber bar, compact (32px height), full-width above content:
```
⚠  Read-only — viewer access. Contact the project owner to request editor access.
```

## Animation standards
- Transitions: `150ms ease` for color/background, `200ms ease` for
  transforms, `250ms ease-out` for modals/panels entering.
- No gratuitous animation. The one deliberate motion: the progress bar
  loading state, which gives the tool a "working" feel without blocking UI.
- Respect `prefers-reduced-motion`: wrap all transitions in
  `@media (prefers-reduced-motion: no-preference)`.

## Monospace data — application guide
Apply `.mono` class (or `font-mono` Tailwind) + `--mono-color` to:
- File paths (Repo health, PR review, diagram dep graph)
- PR numbers (`#7`, `#4`)
- GitHub usernames (`@TFD666`)
- Hotspot / health scores (`50`, `0.40`)
- Commit counts (`42 commits`)
- Run numbers (`Run #3`)
- Slug / public URL path segments (`/u/username/project-slug`)
- Chunk citation references
- Any numeric metric that is a raw data value

Do NOT apply mono to: button labels, headings, body copy, nav labels,
or any text that is UI chrome rather than data.

## Tailwind config additions
Extend `tailwind.config.js` to expose the token system as utilities:

```js
theme: {
  extend: {
    colors: {
      base:    'var(--bg-base)',
      surface: 'var(--bg-surface)',
      subtle:  'var(--bg-subtle)',
      border:  'var(--border)',
      accent:  'var(--accent)',
      // ... etc, expose all tokens
    },
    fontFamily: {
      sans: ['Geist', 'system-ui', 'sans-serif'],
      mono: ['Geist Mono', 'monospace'],
    },
    borderRadius: {
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
    },
  }
}
```

## Implementation order
The design system is implemented ONCE, then every page spec references it.

**Step 1 (this spec):**
1. Add Geist + Geist Mono to `index.html`
2. Create `src/styles/tokens.css` with all CSS custom properties above
3. Import `tokens.css` in `main.jsx` (before `index.css`)
4. Extend `tailwind.config.js` with token mappings
5. Update `index.css` base styles (body bg, font, etc.)
6. Build the shared components:
   - `ProgressBar.jsx` (top loading bar)
   - `Badge.jsx` (all variants)
   - `EmptyState.jsx`
   - `Toast.jsx` / hook
   - `ViewerBanner.jsx`
7. Build the app shell: `Sidebar.jsx` + layout wrapper
8. Smoke test: confirm the shell renders with correct colors/fonts,
   existing pages don't break (they'll look unstyled inside the new
   shell — that's expected, fixed page by page).

**After this spec, page specs in order:**
1. Dashboard (most visited, sets the tone for the app)
2. MentorChat (most used feature)
3. CareerMode + PublicProject + PublicProfile (portfolio-facing, highest
   recruiter visibility — do all three together since they share a design
   language)
4. RepoHealth
5. ArchDiagram
6. PRReview
7. TeamSettings + InvitesInbox (lowest traffic, simplest layouts)

## Do not
- Do not hardcode any hex value in a component — always use CSS vars or
  Tailwind tokens derived from them.
- Do not use box shadows heavier than `--shadow-md` — this aesthetic is
  flat, borders do the work shadows would do elsewhere.
- Do not add border-radius > 12px anywhere except modals/drawers.
- Do not use `.mono` on UI chrome — only on actual data values.
- Do not build page-level styles until the design system step is smoke-
  tested and the shell renders correctly.
- Do not fold page redesigns into this step — shell + tokens only.
