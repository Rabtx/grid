---
id: str-console-appearance-settings
title: Settings → Appearance screen
type: feature
from: human
to: web
priority: high
status: doing
assignee: buffy (deepseek-v4-flash)
reviewer: claude
parent: .agents/plans/console-design-migration.md (phase 6: settings, appearance)
depends_on: [str-console-appearance-model]
branch: agent/web/console-appearance-settings
worktree: ../grid-worktrees/agent/web/console-appearance-settings
scope:
  - apps/console/src/modules/settings/**
  - apps/console/src/ui/slider.tsx
  - apps/console/src/ui/icons.tsx
  - apps/console/src/ui/index.ts
  - apps/console/src/ui/primitives.test.tsx
  - apps/console/src/routes/dev-ui.tsx
  - apps/console/src/app.tsx
  - apps/console/src/modules/shell/components/project-nav.tsx
  - apps/console/src/routes/app-shell.test.tsx
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
ports: none (no dev server started)
---

## What

Build **Settings → Appearance** (`/settings/appearance`): the screen where people customise how
the console looks — theme, accent colour, tint, translucency and interface scale — matched to the
human's prototype. Add a **Settings** entry to the sidebar / phone drawer.

## Why / Context

The human designed the settings UI in their prototype and wants it followed, not reinvented. The
appearance *model* already exists and is merged: `apps/console/src/lib/appearance.ts` —
`appearance()` (reactive accessor), `updateAppearance(patch)`, `resetAppearance()`,
`APPEARANCE_DEFAULTS`, `APPEARANCE_LIMITS` (min/max/step per slider), `ACCENT_PRESETS`. It applies
and persists everything; **this card is only the screen**. Do not change `appearance.ts` or the
tokens.

Read first, in order: `AGENTS.md`, `DESIGN.md` → "Product tokens (console)",
`.agents/skills/solid-2/SKILL.md`, `.agents/skills/mobile-first/SKILL.md`, then
`apps/console/src/lib/appearance.ts`, `apps/console/src/ui/*` (reuse `SegmentedControl`,
`Button`, `Caption`, icons), `apps/console/src/app.tsx`,
`apps/console/src/modules/shell/components/project-nav.tsx`.

## Proposal (build exactly this — values measured from the prototype)

### Route and navigation
- `app.tsx`: `/settings` redirects (replace) to `/settings/appearance`; `/settings/appearance`
  renders the screen inside `RequireAuth` (same pattern as `BoardRoute`).
- `project-nav.tsx`: a **Settings** row in the bottom block, above the email / Sign out, same
  `NAV_ROW` recipe, `aria-current="page"` when the path starts with `/settings`. Add a
  `SettingsIcon` to `ui/icons.tsx` from `@hugeicons/core-free-icons/Settings01Icon` and a
  `RestoreIcon` from `RotateCcwIcon` (follow the existing icons exactly).

### Screen layout (`modules/settings/components/appearance-screen.tsx`)
- Content column `mx-auto w-full max-w-[60rem]`, `py-6 md:py-10`.
- Page header: title "Appearance" `text-title font-semibold`, description
  "Theme, tint, translucency and interface scale." `text-ui-sm text-ink/50`; on the right (below
  the title on phones) a `Button variant="ghost"` **Restore defaults** with `RestoreIcon`, calling
  `resetAppearance()`.
- **Group** component: title `text-ui font-semibold` (13px), description `text-ui-sm text-ink/45`
  (12px), `mb-2`, then a card `rounded-xl border border-ink/10 bg-ink/3` whose rows are
  separated by `divide-y divide-ink/5`. Groups are `mt-8` apart.
- **Row** component: `px-4 py-3.5`; label `text-ui font-medium`, description
  `text-ui-sm text-ink/45`; the control on the right, capped `max-w-[60%]`, right-aligned. Use a
  container query (`@container` on the card, `@[35rem]:flex-row`): below 35rem the row stacks —
  label block above, control full width below.
- **Slider** primitive (`ui/slider.tsx`): a native `<input type="range">` (keyboard and screen
  readers for free) styled `appearance-none h-1 rounded-full bg-ink/15`, thumb 14px round
  `bg-ink`, filled part up to the value in `bg-ink/60` (a background gradient from the value's
  percentage), `focus-ring` on the thumb; props `label`, `min`, `max`, `step`, `value`,
  `onInput(value: number)`, `format(value) => string`; renders the formatted value to the right
  in `w-12 text-right text-ui-sm tabular-nums text-ink/70`. Track width `w-full md:w-44`.
- **Accent swatches** (in the settings module): a row of `size-5 rounded-full` buttons with
  `gap-2.5` — first the default (a split circle: canvas / ink, `aria-label="Default"`), then each
  `ACCENT_PRESETS` colour, then **Custom**: a conic-gradient swatch wrapping a visually hidden
  `<input type="color">` (native picker; `aria-label="Custom colour"`). Selected swatch:
  `ring-2 ring-ink/60 ring-offset-2 ring-offset-canvas`; each is a `<button aria-pressed>` with
  its hex as `aria-label`.

### Groups and rows (copy in Grid's words)

| Group (description) | Row — description | Control |
|---|---|---|
| **Theme** — "Dark and light share the same tint, so the colour settings below apply to both." | Theme — "System follows your device's appearance." | `SegmentedControl` System / Dark / Light → `theme` |
| | Accent colour — "Used for primary actions such as New task and Sign in." | swatches → `accent` |
| **Colour** — "Hue and saturation tint every surface. Lightness only moves the dark theme." | Hue — "Base hue for tinted surfaces." | slider, `240°` |
| | Saturation — "How strongly the hue tints the interface. Zero keeps it neutral." | slider, `0%` |
| | Dark-mode lightness — "Base brightness of the dark theme. Lower is darker; zero is true black." | slider, `9%` |
| **Translucency** — "How much shows through the glass surfaces. Blur costs more to draw the higher it goes." | Sidebar opacity — "Applies to the sidebar and the phone top bar." | slider `glassOpacity` shown as `85%` |
| | Blur radius — "Blur behind the glass surfaces." | slider `glassBlur`, `24` |
| **Layout** — "Size of the interface on this device." | Interface scale — "Zoom the whole interface. You can also use Ctrl+=, Ctrl+- and Ctrl+0 (⌘ on macOS)." | slider `uiScale` shown as `100%` |

Use `APPEARANCE_LIMITS` for every slider's min/max/step. Every change calls
`updateAppearance({ … })` immediately (no save button). A small note under the page header:
"These settings are saved on this device." in `text-ui-xs text-ink/40`.

### Tests (`modules/settings/components/appearance-screen.test.tsx`, happy-dom)
Render inside the router + `AuthProvider` + `WorkspaceProvider` like
`routes/app-shell.test.tsx`: all four groups render; moving the Hue slider calls through and sets
`--hue` on `document.documentElement`; clicking a preset swatch sets `--user-accent`; choosing
Dark adds the `dark` class; Restore defaults puts `--hue` back to `240`. Add a Slider case to
`ui/primitives.test.tsx`; update `app-shell.test.tsx` only if the nav change breaks a selector.

## Scope

**In scope:** the paths in `scope`. **Out of scope:** `lib/appearance.ts`, `packages/tokens`,
the board and task panel (another agent is moving tasks in parallel), settings search, other
settings sections. Never name any external product or project in code, comments or commits.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `typecheck` · `build` · `bun run lint` · `bun run format` ·
  `bun run architecture:check`
- The dev servers on ports 3000–3002 and 4000 belong to the human — do not start or stop anything
  on them. The reviewer checks the screen against the prototype at 375 and 1280 px, dark and light.

## Resolution

<Filled by the resolver.>
