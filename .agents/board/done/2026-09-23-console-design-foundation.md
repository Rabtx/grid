---
id: str-console-design-foundation
title: Framework-free design tokens and the console's product foundation
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: agy (gemini-3.8-flash-high)
reviewer: claude
parent: none
depends_on: []
branch: agent/ui-ux/console-design-foundation
worktree: ../grid-worktrees/agent/ui-ux/console-design-foundation
scope:
  - packages/tokens/**
  - packages/ui/src/styles/globals.css
  - packages/ui/package.json
  - apps/console/**
  - DESIGN.md
  - package.json
  - bun.lock
allowed_shared: []
created: 2026-09-23
updated: 2026-09-23
---

## What

Give Grid a framework-free design-token package and build the console's product foundation on it:
a hue-derived neutral palette (light and dark), status colours, font-size tokens enforced by a
test, a density setting, and one shared set of motion timings. Migrate the existing console
components onto the tokens. Everything is mobile first.

## Why / Context

- `apps/console` (Solid 2) is the product. It currently depends on `@grid/ui` — a **React**
  package — only to import `@grid/ui/globals.css`. A Solid app must not depend on React packages.
- The console is about to get its real shell and board. Tokens, type scale, density and motion
  have to exist first so every later screen is consistent.
- Read first: `AGENTS.md`, `DESIGN.md`, `.agents/skills/mobile-first/SKILL.md`,
  `.agents/skills/solid-2/SKILL.md`, `packages/ui/src/styles/globals.css`,
  `apps/console/src/**`.

## Proposal (the design decisions are made — implement them)

### 1. New package `packages/tokens` → `@grid/tokens`

- `package.json`: `"name": "@grid/tokens"`, `private: true`, `type: module`, **no dependencies**,
  `exports`: `"./tokens.css"`, `"./base.css"`, `"./product.css"`. Add `lint`/`typecheck`
  scripts only if there is TS to check (there should not be); do not add tooling.
- `src/tokens.css`: move the **existing** shared tokens out of
  `packages/ui/src/styles/globals.css` verbatim — the `@custom-variant dark`, the `@theme inline`
  block, `:root` and `.dark`. Values must not change: `apps/web` must look identical.
- `src/base.css`: the existing `@layer base` block (border/outline defaults, body colours,
  pointer cursor on buttons).
- `packages/ui/src/styles/globals.css` becomes: `@import "./typeset.css";`,
  `@import "@grid/tokens/tokens.css";`, `@import "@grid/tokens/base.css";`. Add
  `"@grid/tokens": "workspace:*"` to `packages/ui/package.json` dependencies. Verify `apps/web`
  and `apps/docs` still build and render the same.

### 2. `src/product.css` — the console's product layer (imported after tokens.css)

All colours in `oklch`. Everything derives from two variables so the whole UI can be re-tinted
by changing one number:

```css
:root {
  --hue: 250;        /* neutral tint hue (cool grey) */
  --tint: 0.008;     /* neutral chroma — near-monochrome */
  --accent-hue: 163; /* Grid green, same as today's --primary */
}
```

**Neutral scale** — define surfaces and text from `--hue`/`--tint`, then point the existing
shadcn names at them so every current class (`bg-background`, `bg-card`, `text-muted-foreground`,
`border-border`…) keeps working:

| Role | Light | Dark |
|---|---|---|
| `--surface-0` (page, maps to `--background`) | L 0.99 | L 0.145 |
| `--surface-1` (sidebar, board lanes, maps to `--sidebar`, `--muted`) | L 0.975 | L 0.175 |
| `--surface-2` (cards, popovers, maps to `--card`, `--popover`) | L 1.0 | L 0.205 |
| `--surface-3` (hover/selected rows, maps to `--accent`) | L 0.955 | L 0.245 |
| `--text` (maps to `--foreground`) | L 0.2 | L 0.96 |
| `--text-muted` (maps to `--muted-foreground`) | L 0.5 | L 0.7 |
| `--text-subtle` (ids, timestamps, counts) | L 0.62 | L 0.56 |
| `--border` | `color-mix(in oklab, var(--text) 9%, transparent)` | `… 10% …` |
| `--border-strong` (inputs) | `… 16% …` | `… 18% …` |

Each neutral is `oklch(<L> var(--tint) var(--hue))`. `--primary` = `oklch(0.6 0.13 var(--accent-hue))`
light / `oklch(0.7 0.15 var(--accent-hue))` dark; keep today's `--primary-foreground` values.
`--ring` = primary at 60% via `color-mix`.

**Theme selection**: follow the OS by default (`@media (prefers-color-scheme: dark)` applies the
dark values to `:root:not(.light)`), and allow a forced theme with `.dark` / `.light` on `<html>`.
Keep the existing `@custom-variant dark` working for `.dark`, and make `dark:` also match the
OS-dark case (e.g. `@custom-variant dark (&:where(.dark, .dark *), @media (prefers-color-scheme: dark) { &:where(:not(.light), :not(.light) *) })`
— verify the exact Tailwind 4 syntax against `node_modules/tailwindcss` docs/source; if the media
form is not supported, document the limitation in DESIGN.md and keep `.dark`).
Set `color-scheme: light dark` on `:root` so native controls and scrollbars follow.

**Status colours** for the board's seven stages (`backlog`, `ready`, `in_progress`, `review`,
`qa`, `blocked`, `done` — see `apps/console/src/modules/projects/types/project.types.ts`), exposed
as Tailwind colours `status-<name>` via `@theme inline` (`--color-status-backlog` etc.):
backlog = `--text-subtle`; ready = hue 250 C 0.12; in_progress = hue 75 (amber) C 0.15;
review = hue 300 C 0.13; qa = hue 200 C 0.12; blocked = hue 25 C 0.19; done = `--accent-hue`
C 0.13. L 0.6 light / 0.72 dark. They are used for small dots, left rules and badges — never large
fills.

**Type scale** — font-size tokens via `@theme` so Tailwind generates the utilities. Mobile values
are the defaults and step down from `md:` (48rem) up, because touch UIs need slightly larger text
and inputs must be ≥16px on phones:

| Utility | Phone | ≥ md | Use |
|---|---|---|---|
| `text-ui-xs` | 0.75rem / 1rem | 0.6875rem / 1rem | ids, counts, timestamps |
| `text-ui-sm` | 0.875rem / 1.25rem | 0.8125rem / 1.125rem | secondary text, labels |
| `text-ui` | 0.9375rem / 1.375rem | 0.875rem / 1.25rem | body, buttons, list rows |
| `text-ui-input` | 1rem / 1.5rem | 0.875rem / 1.25rem | every `<input>`, `<select>`, `<textarea>` |
| `text-ui-lg` | 1.0625rem / 1.5rem | 1rem / 1.5rem | section headings |
| `text-title` | 1.25rem / 1.75rem | 1.375rem / 1.875rem | page titles |

Implement with CSS variables that change inside `@media (width >= 48rem)`, referenced from
`@theme` (`--text-ui: var(--fs-ui); --text-ui--line-height: var(--lh-ui);` etc.). Fonts: the
system stacks only — `--font-sans: ui-sans-serif, system-ui, sans-serif, …` and
`--font-mono: ui-monospace, SFMono-Regular, Menlo, monospace`. No web fonts. Letter-spacing 0.

**Density** — `data-density="compact" | "comfortable" | "spacious"` on `<html>`, default
comfortable. `--density: 0.85 | 1 | 1.15`. Derived tokens exposed as Tailwind spacing/sizing
(`--spacing-row`, `--spacing-control`, `--spacing-gutter`): row height
`calc(2.5rem * var(--density))`, control height `calc(2.25rem * var(--density))`, gutter
`calc(1rem * var(--density))`. **On `(pointer: coarse)` the control and row heights never go
below 2.75rem (44px)** — use `max()`. Add a tiny `apps/console/src/lib/preferences.ts` with
`applyDensity(value)` / `applyTheme("system" | "light" | "dark")` that set the attribute/class on
`document.documentElement` and persist to `localStorage` under `grid.density` / `grid.theme`
(wrap storage access in try/catch — it can throw). Call the restore once in `main.tsx` before
`render`. No UI for switching yet.

**Motion** — one set of timings: `--duration-fast: 120ms` (hover/press feedback),
`--duration-base: 200ms` (disclosure, tab switch), `--duration-slow: 280ms` (sheets, drawers
arriving); `--ease-out: cubic-bezier(0.2, 0, 0, 1)`, `--ease-in: cubic-bezier(0.4, 0, 1, 1)`
(exits are faster: use fast + ease-in). Expose as Tailwind `duration-fast|base|slow` and
`ease-out-grid|in-grid` via `@theme`. Under `@media (prefers-reduced-motion: reduce)` all three
durations become `0.01ms`. Document "no bespoke durations or easings in components" in DESIGN.md.

**Viewport** — `apps/console/index.html`: `width=device-width, initial-scale=1, viewport-fit=cover`
and `<meta name="color-scheme" content="light dark">`. Add `<meta name="theme-color">` for light
and dark (use the surface-0 colours).

### 3. Console wiring

- `apps/console/src/styles/global.css`: `@import "tailwindcss";` then `@grid/tokens/tokens.css`,
  `@grid/tokens/product.css`, `@grid/tokens/base.css`. Do **not** import `typeset.css`.
- `apps/console/package.json`: replace `"@grid/ui": "workspace:*"` with
  `"@grid/tokens": "workspace:*"`. Nothing in the console may import `@grid/ui` afterwards.
- Migrate every existing console component (`src/**/*.tsx`) to the tokens: replace `text-xs`,
  `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-[10px]` etc. with the `text-ui*`
  / `text-title` scale (inputs and selects get `text-ui-input`). Keep layouts as they are — the
  shell and board are rebuilt in a follow-up card; this card only moves them onto tokens.

### 4. Enforcement test

`apps/console/src/styles/tokens.test.ts` (Vitest, node environment): read every `*.tsx` under
`apps/console/src` and fail with file:line for any Tailwind font-size utility outside the token
scale (`text-(xs|sm|base|lg|xl|[2-9]xl)` and `text-[<number><unit>]`), any arbitrary duration
(`duration-[…]`, `duration-<number>`), and any import from `@grid/ui`. Make the regex precise so
colour utilities like `text-muted-foreground` or `text-status-done` do **not** match.

### 5. DESIGN.md

Add a short "Product tokens (console)" section: the neutral scale and `--hue`/`--tint`, status
colours, the type scale table, density, motion, theme selection, and the rule that the console uses
only these (enforced by `tokens.test.ts`). Update the "Tokens" section to say shared tokens live in
`packages/tokens` and `@grid/ui` re-exports them for the React apps.

## Scope

**In scope:** the paths in `scope` above.

**Out of scope:** rebuilding the shell or board layout (next card); any React component in
`packages/ui/src/components`; `apps/web` source; `apps/nest-api`; `.agents/ownership.yaml`.
Do not name any external product or project in code, comments, docs or commits.

## Validation

Run from this worktree root and paste the real output tails into Resolution:

- `bun install` (lockfile updated for the new workspace package)
- `bun run lint`, `bun run format`, `bun run typecheck`
- `bun --cwd=apps/console run test` (including the new tokens test) and `bun --cwd=apps/console run build`
- `bun --cwd=apps/web run build` and `bun --cwd=apps/docs run build` — web/docs unchanged
- `bun run architecture:check`
- `grep -rn "@grid/ui" apps/console` returns nothing

## Resolution

Implemented by agy (gemini-3.8-flash-high) over two runs; both runs exited while builds were still
running in the background, so the reviewer (claude) ran validation, reviewed the diff and committed.

- `packages/tokens` (`@grid/tokens`, no dependencies) holds `tokens.css` and `base.css`, moved verbatim
  from `packages/ui/src/styles/globals.css` (which now imports them), plus `product.css`: the
  hue-derived neutral scale, status colours, mobile-first type scale, density, motion, OS/forced theme.
- The console depends on `@grid/tokens` instead of `@grid/ui`; every component uses the `text-ui*`
  scale; `src/lib/preferences.ts` restores `grid.theme` / `grid.density` before render;
  `index.html` has `viewport-fit=cover`, `color-scheme` and `theme-color`.
- `src/styles/tokens.test.ts` enforces the scale; DESIGN.md documents the product tokens.

Validation (reviewer, 2026-09-23):
- lint: all workspaces exit 0; typecheck: logger, console, ui, web, nest-api exit 0
- console test: `Tests 5 passed (5)`; negative check with a temp file using `text-sm` and
  `duration-300` → `Tests 1 failed | 4 passed` with both violations reported (temp file removed)
- console build `✓ built`; probe confirmed `duration-fast|slow`, `ease-out-grid`, `text-ui-input`,
  `h-control`, `min-h-row`, `bg-status-done` and both `dark:` forms are generated
- web build `✓ Compiled successfully`, 18/18 static pages; docs build `✓ Compiled successfully`, 47/47
- `architecture:check` OK; `grep -rn "@grid/ui" apps/console` (excluding node_modules/dist) empty
- Browser at 375px: login renders in light and dark following the OS, inputs 16px, no horizontal
  scroll, `data-density="comfortable"`.
