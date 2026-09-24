---
id: str-console-appearance-settings
title: Settings → Appearance screen
type: feature
from: human
to: web
priority: high
status: done
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

**Changed**

- `apps/console/src/ui/icons.tsx` — `SettingsIcon` (`Settings01Icon`) and `RestoreIcon` (`RotateCcwIcon`), same recipe as the existing glyphs.
- `apps/console/src/ui/slider.tsx` (new) — native `<input type="range">`: `h-1 rounded-full bg-ink/15` track, 14px solid `bg-ink` thumb, `bg-ink/60` gradient filled to the value, `w-full md:w-44`, keyboard-only `focus-ring`, and the formatted value right-aligned in `w-12 text-ui-sm tabular-nums text-ink/70`.
- `apps/console/src/ui/index.ts` — exports `Slider`.
- `apps/console/src/modules/settings/components/appearance-screen.tsx` (new) — `AppearanceScreen` with the four `Group`s (Theme, Colour, Translucency, Layout), the container-query `Row` (`@container` card, `@[35rem]:flex-row`), the header with **Restore defaults**, and the accent swatches (split canvas/ink default, `ACCENT_PRESETS`, a custom `<input type="color">`). Every change calls `updateAppearance`; every slider takes its min/max/step from `APPEARANCE_LIMITS`.
- `apps/console/src/modules/settings/index.ts` (new) — exports `AppearanceScreen`.
- `apps/console/src/app.tsx` — `/settings` redirects (replace) to `/settings/appearance`; `/settings/appearance` renders the screen inside `RequireAuth`.
- `apps/console/src/modules/shell/components/project-nav.tsx` — a **Settings** row above the account block, `aria-current="page"` when the path starts with `/settings`.
- `apps/console/src/routes/dev-ui.tsx` — a Slider row in the primitives gallery.
- `apps/console/src/ui/primitives.test.tsx` — a Slider case.
- `apps/console/src/modules/settings/components/appearance-screen.test.tsx` (new) — 5 happy-dom tests: the four groups render, the Hue slider sets `--hue`, a preset swatch sets `--user-accent`, Dark adds the `dark` class, Restore defaults puts `--hue` back to `240`.

**Validation** (worktree root, real tails)

```text
$ bun --cwd=apps/console run test
 ✓  dom  src/modules/settings/components/appearance-screen.test.tsx (5 tests)
 ✓  dom  src/ui/primitives.test.tsx (11 tests)
 Test Files  10 passed (10)
      Tests  55 passed (55)

$ bun --cwd=apps/console run typecheck
$ tsc --noEmit                       # exit 0, no diagnostics

$ bun --cwd=apps/console run build
✓ 129 modules transformed.
dist/assets/index-9qlRB_Fw.css        46.77 kB │ gzip:  9.04 kB
dist/assets/index-Dg13COpp.js        150.87 kB │ gzip: 51.04 kB
✓ built in 2.32s

$ bun run lint
console lint: Found 0 warnings and 0 errors.
console lint: Exited with code 0
web lint: Found 9 warnings and 0 errors.   # pre-existing, all in apps/web
web lint: Exited with code 0

$ bun run format
Finished in 187ms on 372 files               # no changes outside this card's scope

$ bun run architecture:check
Architecture checks passed.
[naming] OK (476 path(s) checked)
```

No dev server was started: ports 3000, 3001, 3002 and 4000 were not touched. The `dist` CSS was inspected to confirm the classes the prototype needs actually compile (`@container (width>=35rem)`, `bg-ink/3`, `divide-ink/5`, the `::-webkit-slider-thumb` rules).

**Notes / deliberate decisions**

1. `focus-ring` sits on the range `<input>` (the element that receives keyboard focus), not the thumb pseudo-element, which cannot match `:focus-visible`. Same keyboard-only accent outline; a screen reader still gets the value.
2. `SettingsRedirectRoute` uses the same `createEffect` + `navigate(..., { replace: true })` pattern as `ProjectRedirect` and `LoginRoute`; Solid 2's `createEffect` takes compute and apply, so a bare one-argument call is not available.
3. The swatch buttons keep the prototype's `size-5` glyph rather than a 44px hit area, per the measured brief; the row is `flex-wrap` so it never overflows a phone.

**Not done / deferred:** the 375/1280 px dark and light browser pass against the prototype is the reviewer's step, as the card states. `app-shell.test.tsx` was left unchanged — the new Settings row did not break its selectors.

**Contract impact:** none — `apps/console/src/lib/appearance.ts` and `packages/tokens` are untouched; no API change.

**Review:** reviewer `claude` owns the browser pass and the merge; the branch is pushed and a PR is open against `main`, not merged.

**Commit:** `6eebd18` (feature); the claim and this resolution are separate `chore`/`docs` commits.
