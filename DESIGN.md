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

Shared Tailwind 4 tokens live in `packages/tokens` (`@grid/tokens`), exported as `tokens.css`, `base.css`, and `product.css`. `@grid/ui` re-exports `tokens.css` and `base.css` for the React apps via `packages/ui/src/styles/globals.css`; `product.css` is the console's design system (below).

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

The console's design lives in `@grid/tokens/product.css` and the primitives in
`apps/console/src/ui/`. `apps/console/src/styles/tokens.test.ts` fails the build on font sizes
outside the scale, one-off durations, and imports from the React UI package. In development,
`/dev/ui` shows every primitive in every state.

### Principles

1. **Two colours make everything.** A theme is a `canvas` and one `ink`. Every border, fill,
   hover, selection and secondary text is ink mixed over transparent at a fixed strength. There
   is no grey palette.
2. **Hierarchy through ink, not colour or size.** Importance is how much ink an element carries.
   Most text is secondary; only data and active states get full ink.
3. **Chrome recedes, content leads.** Navigation and controls are low contrast; the user's data
   is the only thing at full contrast.
4. **Dense but breathable on desktop, thumb-sized on phones.** One component, two scales.
5. **Colour is a signal, never decoration.** Accent means focus, active or link; success, danger
   and warning appear only for meaning, as text or a 10% fill — never a large solid fill.
6. **Quiet motion.** Short, ease-out, colour-only on hover; presses scale to 0.97.

### Colour

`--hue` and `--saturation` tint the whole UI (0% is neutral); Settings → Appearance exposes them
as sliders, with the dark canvas lightness. Light: canvas 99.2%, backdrop 96.6%, ink 16%.
Dark: canvas 9% (the slider), backdrop 3% below it, ink 92%. The theme follows the OS; `.light` / `.dark` on `<html>` force one
(`lib/preferences.ts` stores the choice).

| Use | Utility |
|---|---|
| Primary content, values, active labels | `text-ink` |
| Strong secondary (section headings, selected nav) | `text-ink/80` |
| Body secondary, secondary-button labels | `text-ink/70` |
| Default secondary label — the most common | `text-ink/55`, `text-ink/50` |
| Metadata, counts, icons at rest | `text-ink/45`, `text-ink/40` |
| Placeholder, disabled only (never information) | `text-ink/35`, `text-ink/30` |
| Raised card or panel, soft hover | `bg-ink/5` |
| Hover on rows and icon buttons | `bg-ink/8` |
| Pressed, active segment | `bg-ink/10` |
| Selected row or tab | `bg-selection` (a softer ladder in light mode) |
| Control, card and popover border | `border-ink/10`; inputs `border-ink/12` → `/30` on focus |
| Structural dividers only | `border-stroke` (ink 7%) |
| Signals | `text-accent`, `text-success`, `text-danger`, `text-warning`, `text-link` |

Board stages are signals too: waiting stages in low ink, in progress `warning`, review
`accent`, blocked `danger`, done `success` — always drawn as a shape (`StatusIcon`) as well.

The primary button is an ink inversion (white on dark, ink on light), never a brand colour.
The legacy shadcn names (`bg-card`, `text-muted-foreground`, `border-border`…) are mapped onto
this model for older markup; new console code uses the ink utilities.

### Type scale

System font stacks only; no letter-spacing except the uppercase `Caption`. Phones get the larger
scale (inputs stay ≥ 16px so iOS never zooms); from `md:` the desktop scale matches a dense tool.

| Utility | Phone | ≥ md | Use |
|---|---|---|---|
| `text-ui-caption` | 11px | 10px | uppercase group captions |
| `text-ui-xs` | 12px | 11px | metadata, counts, chips, timestamps |
| `text-ui-sm` | 13px | 12px | controls, buttons, descriptions, labels |
| `text-ui` | 15px | 13px | row titles, nav items, card titles |
| `text-ui-input` | 16px | 12px | every input, select and textarea |
| `text-ui-lg` | 16px | 14px | emphasised single values |
| `text-title` | 20px | 20px | the one view title |

Icons are Hugeicons at a 1.5 stroke, `text-ink/55` beside nav labels.

Weights: `font-medium` for titles, active labels and buttons; `font-semibold` for view titles and
captions. Mono for ids, branches, paths and shortcuts.

### Size, density, radius

`h-row` and `h-control` are 28px on desktop (40px on narrow screens), `h-field` 36px (44px);
on any coarse pointer all three stay ≥ 44px. `data-density="compact | comfortable | spacious"`
on `<html>` scales them. Radius by nesting: chips `rounded-sm` (4px), controls `rounded-md`
(6px, the default), cards `rounded-lg` (8px), floating surfaces `rounded-xl` (12px).

### Surfaces

Four levels, no shadows on in-flow content: the backdrop (`bg-backdrop`), which the desktop
sidebar sits on; the canvas, the screen itself, drawn on desktop as one panel inset 8px from the
backdrop (`rounded-xl`, `border-ink/8`) and edge to edge on phones; the phone navigation layer
(`glass`: canvas at 85%, blurred); raised cards (`bg-ink/5 border-ink/10 rounded-lg`, flat); floating layers
(sheets, menus, dialogs: solid canvas, `border-ink/10`, the only shadows). Regions are separated
by 1px `stroke` lines, never gaps or shadows.

### Motion

`duration-fast` 120ms (feedback), `duration-base` 160ms (disclosure, reorder), `duration-slow`
260ms (sheets and drawers, with `ease-sheet`); `ease-out-grid` otherwise. Reduced motion collapses
all three. Nothing moves on hover except colour; no bounces, no staggered entrances.

### Interaction

Focus is keyboard-only (`focus-ring`: a 2px accent outline). Secondary row actions may appear on
hover on pointer devices but are always visible on touch. Empty states are one short sentence;
errors are an inline strip with the concrete reason and a retry.

## Kit (the console rebuild)

The console is being rebuilt screen by screen on a new design system in `apps/console/src/kit`,
taken closely from the reference designs: light, calm and spacious, with hierarchy from text
colour rather than size. Tokens live in `@grid/tokens/kit.css`, on top of the same hue,
saturation and lightness inputs as above. `/design` shows every piece in every state, with an app
preview composed only of kit parts; new screens use the kit, and `@/ui` goes away as screens move.

- **Font:** Inter (self-hosted), regular and medium only. Sizes: caption 12, body 13 (the base),
  body-lg 14, heading 16, headline 18, display 24; phones step up (body 15, fields 16).
- **Text:** `text-fg` strong, `text-fg-muted` default, `text-fg-subtle` metadata and section
  labels, `text-fg-faint` placeholders only.
- **Surfaces:** `bg-surface` content, `bg-surface-sunken` the frame and sidebar,
  `bg-surface-raised` menus and dialogs; `line` / `line-strong` hairlines; `fill` hover,
  `fill-strong` selected.
- **Shape:** rows 30px and controls 32px on desktop (44px on touch); radius 6 chips, 8 controls,
  12 cards, 14 floating surfaces, 18 the composer; `shadow-float` for floating layers,
  `shadow-raise` for the composer and prompts.
- **Layout:** the sidebar sits on the sunken frame; the screen is a raised panel beside it; open
  things are tabs along the top. Phones get a top bar and a drawer; every menu and dialog is a
  bottom sheet there.

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
