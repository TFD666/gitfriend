# Landing Page — Page Spec (UI/UX Overhaul)

## Reference
Read `DESIGN_SYSTEM.md` first. All tokens apply here too. The landing
page shares the same dark theme and type system as the app, but has no
app shell (no sidebar, no page header). It lives at `/` in React Router,
rendered outside the authenticated shell wrapper.

## What exists now at `/`
Presumably a redirect to `/dashboard` or a bare login prompt. Replace
entirely with this spec. Unauthenticated users see the landing; if a
user is already logged in and hits `/`, redirect to `/dashboard` as
before.

## Page structure
```
┌─────────────────────────────────────────────────────┐
│ Nav                                                  │
├─────────────────────────────────────────────────────┤
│ Hero                                                 │
├─────────────────────────────────────────────────────┤
│ Features grid                                        │
├─────────────────────────────────────────────────────┤
│ How it works                                         │
├─────────────────────────────────────────────────────┤
│ Built by                                             │
├─────────────────────────────────────────────────────┤
│ Footer                                               │
└─────────────────────────────────────────────────────┘
```

Max content width: `900px`, centered, `padding: 0 24px`.
Full-page background: `--bg-base`.

---

## Section 1 — Nav
Fixed top, `height: 52px`, `border-bottom: 1px solid --border-subtle`,
`background: rgba(9,9,11,0.85)`, `backdrop-filter: blur(8px)`,
`z-index: 50`.

```
[DevKit AI]                    [GitHub ↗]  [LinkedIn ↗]  [Sign in →]
```

- Logo: "DevKit AI" in `font-weight: 700`, `font-size: 15px`,
  `--text-primary`. No icon needed — wordmark only.
- GitHub + LinkedIn: ghost icon-only buttons (use `Github` and
  `Linkedin` from lucide-react), `--text-secondary`, open in new tab.
  GitHub URL: `https://github.com/Sleeping_bear` (placeholder — update
  with real URL before deploy).
  LinkedIn URL: placeholder, update before deploy.
- "Sign in →": `btn-primary`, small (`padding: 5px 12px`,
  `font-size: 13px`). Triggers GitHub OAuth flow.

---

## Section 2 — Hero
Full viewport height (`min-height: calc(100vh - 52px)`), flex column,
`justify-content: center`, `padding: 80px 0 64px`.

**Background detail (the one aesthetic risk):**
A very faint dot grid behind the hero content only — `radial-gradient`
pattern at `--border-subtle` opacity (≈ 15% visible). CSS only, no image.
```css
background-image: radial-gradient(circle, var(--border) 1px, transparent 1px);
background-size: 24px 24px;
```
Fades out at the bottom via a `mask-image: linear-gradient(to bottom,
black 60%, transparent 100%)`. Stops at the hero section boundary —
does NOT continue into features.

**Eyebrow:**
```
✦ RAG-powered codebase intelligence
```
`font-size: 12px`, `font-weight: 500`, `--accent` color, `font-family:
mono`, letter-spacing loose. The `✦` is a literal character, not an icon.

**Headline:**
```
Understand your codebase.
Build your portfolio.
```
`font-size: 48px` (desktop) / `32px` (mobile), `font-weight: 700`,
`line-height: 1.1`, `--text-primary`. Two lines, intentional line break.
No gradient text — plain white. Restraint is the point.

**Subheadline:**
```
DevKit AI indexes your GitHub repos, powers natural-language Q&A
over your code, and turns your work into shareable portfolio content —
resume bullets, architecture diagrams, and AI code reviews included.
```
`font-size: 16px`, `color: --text-secondary`, `max-width: 540px`,
`line-height: 1.6`, `margin-top: 20px`.

**CTA row:** `margin-top: 32px`, `gap: 12px`, flex row.
- Primary: "Connect GitHub" — `btn-primary`, `Github` icon + label,
  standard size. Triggers OAuth.
- Secondary: "See an example ↗" — `btn-secondary`, links to a real
  public project page (hardcode a working `/u/Sleeping_bear/<slug>` URL
  once one exists, or omit secondary CTA until deploy).

**Hero visual — chat mock:**
Below the CTA row, `margin-top: 48px`. A styled terminal/chat panel,
`max-width: 640px`, centered. This is HTML, not a screenshot.

```
┌──────────────────────────────────────────────────────┐
│  ● ● ●   devkit-ai / mentor                          │  ← traffic lights + title bar
├──────────────────────────────────────────────────────┤
│                                                      │
│  > How does the authentication flow work?            │  ← user message, mono
│                                                      │
│  The auth flow uses GitHub OAuth. When a user hits   │  ← response, sans
│  /auth/github, they're redirected to GitHub for      │
│  authorization. On callback, the access token is     │
│  encrypted with AES-256 before storage in Postgres.  │
│                                                      │
│  ↳ backend/app/routers/auth.py                       │  ← citation, mono + accent
│  ↳ backend/app/services/encryption.py               │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Styling:
- Container: `--bg-surface` bg, `1px solid --border`, `border-radius:
  --radius-lg`, `padding: 0`. Subtle `--shadow-md`.
- Title bar: `height: 36px`, `background: --bg-overlay`,
  `border-bottom: 1px solid --border`, `border-radius: --radius-lg
  --radius-lg 0 0`, flex, align-center, `padding: 0 12px`. Traffic
  light dots: three 10px circles, colors `#FF5F57`, `#FEBC2E`,
  `#28C840`, `gap: 6px`. Title: "devkit-ai / mentor" in `.mono`,
  `--text-muted`, centered absolutely.
- Body: `padding: 20px 20px 24px`.
- User message: `.mono`, `--text-secondary`, prefixed with `> ` in
  `--accent`.
- Response text: `font-size: 13px`, `--text-primary`, `line-height: 1.6`.
- Citations: `.mono`, `font-size: 11px`, `--accent` color, `margin-top:
  12px`. Each on its own line, prefixed with `↳ `.
- The blinking cursor: a `2px × 14px` `--accent` block after the last
  response character, `animation: blink 1s step-end infinite`.

This mock is static HTML — no actual API calls. It's illustrative.

---

## Section 3 — Features grid
`padding: 80px 0`, `border-top: 1px solid --border-subtle`.

**Section eyebrow:**
```
Everything your dev workflow needs
```
`font-size: 13px`, `--text-muted`, `font-weight: 500`, centered,
`text-transform: uppercase`, `letter-spacing: 0.08em`.

**Grid:** 3 columns × 2 rows (collapses to 2×3 on tablet, 1×6 on mobile).
`gap: 1px` between cells, `background: --border-subtle` (the gaps ARE
the borders — grid-as-border technique, no individual card borders).
Each cell: `background: --bg-base`, `padding: 24px`.

**Feature cell anatomy:**
```
[Icon]
Feature name
One-sentence description of what it does and why it matters.
```
- Icon: lucide-react, 20px, `--accent` color
- Name: `font-size: 14px`, `font-weight: 600`, `--text-primary`,
  `margin: 10px 0 6px`
- Description: `font-size: 13px`, `--text-secondary`, `line-height: 1.5`

**Six features (in order):**

| Icon | Name | Description |
|------|------|-------------|
| `MessageSquare` | Mentor Mode | Ask anything about your codebase in plain English. Gets cited answers from the actual source. |
| `FileText` | Career Mode | Generates portfolio summaries, resume bullets, and interview prep — straight from your indexed code. |
| `Globe` | Public Career Page | Share your work at a readable URL. No login required for visitors. |
| `Activity` | Repo Health | Surfaces complexity hotspots and stale files. Know where the risk lives before it becomes a bug. |
| `GitBranch` | Architecture Diagrams | AI-generated system architecture and dependency graphs, rendered as Mermaid. Export-ready. |
| `GitPullRequest` | PR Review | RAG-augmented code review with inline comments. Optionally posts back to GitHub as a real review. |

---

## Section 4 — How it works
`padding: 80px 0`, `border-top: 1px solid --border-subtle`.

**Heading:**
```
Up and running in minutes
```
`font-size: 24px`, `font-weight: 700`, centered.

**Three steps, horizontal flex** (stacks vertically on mobile):
`gap: 0`, connected by a thin horizontal rule between steps.

Each step:
```
  01
  Connect
  Authenticate with GitHub and select any repo you own.
```
- Step number: `.mono`, `font-size: 28px`, `font-weight: 500`,
  `--accent`, `margin-bottom: 12px`
- Step name: `font-size: 15px`, `font-weight: 600`, `--text-primary`
- Description: `font-size: 13px`, `--text-secondary`, `line-height: 1.5`,
  `margin-top: 6px`

**Steps:**
1. `01` / **Connect** / "Authenticate with GitHub and select a repo.
   DevKit only reads your code — no write access."
2. `02` / **Index** / "DevKit chunks your codebase, generates embeddings,
   and stores them in a vector DB. Takes about a minute."
3. `03` / **Use** / "Ask questions, generate portfolio content, analyze
   repo health, review PRs. Everything in one place."

---

## Section 5 — Built by
`padding: 64px 0`, `border-top: 1px solid --border-subtle`,
centered, `text-align: center`.

```
Built by Sleeping_bear

Final-year CSE student at Lovely Professional University.
DevKit AI is a production-grade full-stack project — FastAPI,
React, pgvector, Gemini, Redis, GitHub OAuth — built as proof
of engineering depth, not just as a portfolio item.

[GitHub ↗]   [LinkedIn ↗]
```

- "Built by Sleeping_bear": `font-size: 18px`, `font-weight: 600`,
  `--text-primary`. "Sleeping_bear" renders in `.mono`, `--accent`.
- Body text: `font-size: 14px`, `--text-secondary`, `max-width: 480px`,
  `margin: 0 auto`, `line-height: 1.6`.
- Stack mention ("FastAPI, React, pgvector..."):
  inline `.mono` fragments, `--mono-color`. Not a badge list — inline
  in prose.
- Links: `btn-secondary` with icons, side by side.

---

## Section 6 — Footer
`padding: 24px 0`, `border-top: 1px solid --border-subtle`, flex,
`justify-content: space-between`, `align-items: center`.

- Left: "DevKit AI", `font-size: 13px`, `font-weight: 600`,
  `--text-muted`.
- Right: "Sign in with GitHub →" ghost link, `font-size: 13px`,
  `--text-secondary`. Triggers OAuth.

---

## Technical notes
- Route: `/` in `App.jsx`, rendered outside the authenticated shell.
  No sidebar, no page header component.
- Auth check: if `useAuth()` / token exists, redirect to `/dashboard`
  immediately. Otherwise render the landing.
- The hero chat mock is fully static — no API calls, no state.
- GitHub + LinkedIn URLs are placeholder strings in a `const LINKS`
  object at the top of `LandingPage.jsx` so they're easy to update
  before deploy. Don't scatter them across the JSX.
- Mobile breakpoints: the grid collapses at `640px`, hero font scales
  at `640px`, how-it-works steps stack at `640px`.
- `prefers-reduced-motion`: the dot grid background, cursor blink, and
  any scroll animations should be wrapped in the reduced-motion media
  query from the design system.

## Do not
- Do not use a hero image or illustration — the chat mock IS the visual.
- Do not add more than 6 features — the grid is 3×2, keep it that way.
- Do not make the dot grid background visible below the hero fold.
- Do not use gradient text on the headline — plain `--text-primary`.
- Do not add a pricing section, FAQ, or testimonials — this isn't a SaaS
  launch, it's a portfolio project landing.
- Do not render the sidebar or any app shell component on this page.
- Do not hardcode GitHub/LinkedIn URLs inline — use the `LINKS` const.
