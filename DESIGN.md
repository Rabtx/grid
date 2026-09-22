# Design System Brief

This file is the source of truth for AI agents and humans when creating UI in Grid.
Keep it updated before generating new screens with Codex, Claude Code, Cursor, v0, Open Design,
Figma MCP, Onlook, Scamp, or similar tools.

## Product Intent

Grid should produce production-grade application interfaces, not generic demo pages.
Generated UI must feel domain-specific, accessible, responsive, and built from reusable components.

## Audience

- Developers starting new products from this monorepo.
- Designers or product builders using AI tools to explore screens.
- AI coding agents implementing UI from product briefs, Figma frames, or design-system prompts.

## Visual Principles

- Prefer clear hierarchy over decoration.
- Prefer operational density for dashboards, admin panels, and internal tools.
- Prefer calm, readable surfaces for documentation and product workflows.
- Avoid generic SaaS hero sections inside actual applications.
- Avoid decorative blobs, background glows, unnecessary nested cards, and one-note purple/blue gradients.
  Glass is an intentional component material described below, not a default page decoration.
- Use real state design: loading, empty, error, disabled, hover, focus-visible, selected, saving,
  success, and permission denied.

## Layout Rules

- Use stable dimensions for toolbars, sidebars, tables, cards, and repeated controls.
- Do not let text overflow buttons, tabs, cards, table cells, or narrow-viewport headers.
- Do not place cards inside cards unless it is a true repeated item or modal body.
- Keep desktop workflows scannable and narrow-viewport workflows thumb-friendly; Grid is a
  browser-first control plane, and a phone is a control surface for it rather than a separate app.
- Use responsive constraints instead of viewport-scaled font sizes.
- Design mobile first: the unprefixed styles are the phone layout, and breakpoint prefixes add the
  tablet and desktop layout in the same component. The rules and checklist live in
  `.agents/skills/mobile-first/SKILL.md`.

## Tokens

Shared Tailwind 4 tokens live in `packages/tokens` (`@grid/tokens`), exported as `tokens.css`, `base.css`, and `product.css`. `@grid/ui` re-exports them for the React apps via `packages/ui/src/styles/globals.css`.

Current baseline:

- Background: `--background`
- Foreground: `--foreground`
- Primary: `--primary`
- Secondary: `--secondary`
- Muted: `--muted`
- Border: `--border`
- Ring: `--ring`
- Radius: `--radius`
- Charts: `--chart-1` through `--chart-5`
- Sidebar tokens: `--sidebar-*`

When adding a new app, do not invent one-off color systems. Extend the shared token package or
create an app-specific override with a short rationale.

## Product tokens (console)

The console builds its product foundation on `@grid/tokens/product.css`. The console uses only these tokens; bespoke font sizes, arbitrary transition durations, or imports from React packages are strictly disallowed and enforced by `apps/console/src/styles/tokens.test.ts`.

### Neutral scale and hue tinting

All neutral surfaces and typography derive in `oklch` from two root variables:
- `--hue`: neutral tint hue (`250`, cool grey)
- `--tint`: neutral chroma (`0.008`, near-monochrome)
- `--accent-hue`: brand accent hue (`163`, green)

Surfaces and text roles map to standard tokens:
- `--surface-0` (page background, maps to `--background`): L 0.99 (light) / L 0.145 (dark)
- `--surface-1` (sidebar, board lanes, maps to `--sidebar`, `--muted`): L 0.975 (light) / L 0.175 (dark)
- `--surface-2` (cards, popovers, maps to `--card`, `--popover`): L 1.0 (light) / L 0.205 (dark)
- `--surface-3` (hover/selected rows, maps to `--accent`): L 0.955 (light) / L 0.245 (dark)
- `--text` (maps to `--foreground`): L 0.2 (light) / L 0.96 (dark)
- `--text-muted` (maps to `--muted-foreground`): L 0.5 (light) / L 0.7 (dark)
- `--text-subtle` (ids, timestamps, counts): L 0.62 (light) / L 0.56 (dark)
- `--border`: `color-mix(in oklab, var(--text) 9%, transparent)` (light) / `10%` (dark)
- `--border-strong` (inputs): `color-mix(in oklab, var(--text) 16%, transparent)` (light) / `18%` (dark)
- `--primary`: `oklch(0.6 0.13 var(--accent-hue))` (light) / `oklch(0.7 0.15 var(--accent-hue))` (dark)
- `--ring`: primary at 60% opacity via `color-mix`

### Theme selection

- Follows the operating system scheme by default via `@media (prefers-color-scheme: dark)` on `:root:not(.light)`.
- Explicit forced theme via `.dark` or `.light` classes on `<html>`.
- Native controls and scrollbars follow via `color-scheme: light dark` on `:root`.
- User preferences persist to `localStorage` under `grid.theme` and restore before initial render.

### Status colours

Stage indicators for the board's seven stages (`backlog`, `ready`, `in_progress`, `review`, `qa`, `blocked`, `done`) use dedicated tokens (L 0.6 light / L 0.72 dark), exposed as Tailwind utilities `status-<name>` (`--color-status-*`):
- `backlog`: `--text-subtle`
- `ready`: hue 250, C 0.12
- `in_progress`: hue 75 (amber), C 0.15
- `review`: hue 300, C 0.13
- `qa`: hue 200, C 0.12
- `blocked`: hue 25, C 0.19
- `done`: `--accent-hue` (163), C 0.13

Status colours are reserved for small indicators (dots, left rules, badges), never large surface fills.

### Type scale

Font-size tokens are exposed via `@theme` so Tailwind generates the utilities. Mobile values are the defaults and step down from `md:` (48rem) up, because touch interfaces require slightly larger text and inputs must be ≥ 16px on phones:

| Utility | Phone | ≥ md | Use |
|---|---|---|---|
| `text-ui-xs` | 0.75rem / 1rem | 0.6875rem / 1rem | ids, counts, timestamps |
| `text-ui-sm` | 0.875rem / 1.25rem | 0.8125rem / 1.125rem | secondary text, labels |
| `text-ui` | 0.9375rem / 1.375rem | 0.875rem / 1.25rem | body, buttons, list rows |
| `text-ui-input` | 1rem / 1.5rem | 0.875rem / 1.25rem | every `<input>`, `<select>`, `<textarea>` |
| `text-ui-lg` | 1.0625rem / 1.5rem | 1rem / 1.5rem | section headings |
| `text-title` | 1.25rem / 1.75rem | 1.375rem / 1.875rem | page titles |

System font stacks are used exclusively (`--font-sans` and `--font-mono`). No web fonts. Letter-spacing is 0.

### Density

Configured via `data-density="compact" | "comfortable" | "spacious"` on `<html>` (default: comfortable), setting `--density` to `0.85`, `1`, or `1.15`.
Exposed as Tailwind spacing/sizing tokens:
- Row height: `calc(2.5rem * var(--density))` (`--spacing-row`)
- Control height: `calc(2.25rem * var(--density))` (`--spacing-control`)
- Gutter: `calc(1rem * var(--density))` (`--spacing-gutter`)

On touch devices (`@media (pointer: coarse)`), control and row heights never go below `2.75rem` (`44px`) via `max()`. Preferences are saved in `localStorage` under `grid.density`.

### Motion

One shared set of timings and easings:
- Fast (`--duration-fast`, `duration-fast`): `120ms` (hover, press feedback)
- Base (`--duration-base`, `duration-base`): `200ms` (disclosure, tab switch)
- Slow (`--duration-slow`, `duration-slow`): `280ms` (sheets, drawers arriving)
- Easings: `--ease-out-grid` (`cubic-bezier(0.2, 0, 0, 1)`) and `--ease-in-grid` (`cubic-bezier(0.4, 0, 1, 1)`)
- Reduced motion: under `@media (prefers-reduced-motion: reduce)`, all durations collapse to `0.01ms`.

No bespoke durations or easings in components.

## Typography

- Use the app's configured sans font for product UI.
- Reserve large display text for true first-viewport marketing or documentation hero sections.
- Use smaller, tighter headings inside dashboards, cards, sidebars, tables, and forms.
- Keep letter spacing at `0` unless a specific brand treatment requires otherwise.

## Components

The repo has a shared web primitive package at `packages/ui` and app-local primitives in
`apps/web/src/components/ui`.

Current rule:

- Use `@grid/ui` for stable shared primitives such as `Button`, `Card`, `Badge`, form fields,
  `Separator`, `Skeleton`, and `Textarea`.
- Keep complex or app-specific composed components inside each app or feature module.
- Promote a component to `packages/ui` only after it is reusable and free of route/auth/data
  coupling.
- Add examples for loading, empty, error, disabled, hover, focus-visible, and selected states.

## AI UI Generation Rules

Before implementing UI, an agent should:

1. Read this `DESIGN.md`.
2. Read the target app's README and existing components.
3. Identify reusable components and tokens.
4. Ask for missing product context if the screen purpose is unclear.
5. Propose an implementation plan before editing.

After implementing UI, an agent should:

1. Run lint/typecheck/tests for the touched app.
2. Capture or inspect rendering at desktop and phone widths where possible.
3. Check long text, empty data, error states, and keyboard focus.
4. List any intentional differences from the design reference.

## Prompt Template

```txt
Use DESIGN.md and the existing app components as the source of truth.

Design/implement [screen/component].

Audience:
[who uses it]

Primary task:
[what the user must complete]

Domain constraints:
[data density, privacy, accessibility, workflow, device context]

Required states:
loading, empty, error, validation, hover, focus-visible, selected, disabled, saving, success

Quality bar:
No generic SaaS layout. No decorative blobs. No nested cards. Use shared tokens, stable spacing,
accessible contrast, responsive behavior, and existing component conventions.

Before coding, return:
1. Components to reuse.
2. New components needed.
3. Token changes if any.
4. Tests or visual checks to run.
```
