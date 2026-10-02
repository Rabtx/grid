---
id: str-figma-foundation
title: Console foundation matches the Figma design system exactly
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: ui-ux
reviewer: reviewer
parent: none
depends_on: []
branch: agent/ui-ux/figma-foundation
worktree: none
scope:
  - packages/tokens/src/product.css
  - packages/tokens/src/kit.css
  - apps/console/src/lib/appearance.ts
  - apps/console/src/lib/appearance.test.tsx
  - apps/console/src/kit/button.tsx
  - apps/console/src/routes/design-gallery.tsx
  - DESIGN.md
  - apps/console/index.html
  - apps/console/public/manifest.webmanifest
  - apps/console/src/kit/palette.tsx
allowed_shared:
  - packages/tokens/src/product.css
  - packages/tokens/src/kit.css
created: 2026-10-01
updated: 2026-10-01
---

## What

Make the console's defaults land exactly on the rabtx Figma design system (file
`Dx4ZZ1v693wRzVDKzunhQA`): colours, signals, type, depth and button shape. First card of the
"replace the whole UI with the Figma design" request; the shell and each screen follow.

## Why / Context

The human redesigned Grid in Figma and asked for the app to use that exact design. `packages/tokens`
is not in the ownership map; the human asked for this change directly (approval noted here).

## Proposal or Ask

Tune the existing HSL/ink inputs instead of adding a palette, so hue, saturation, dark lightness
and line-strength sliders keep working and the defaults equal Figma.

## Scope

**In scope:** the paths in `scope`.

**Out of scope:** the shell (rail + panel, top bar, mobile dock) — next card; per-screen layouts.

## Validation

- `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` in `apps/console`.
- Computed token probe in Chromium at 1440 and 390, light and dark, against the Figma values.

## Resolution

**Changed**

- `product.css`: light canvas 100% (tint pulls it down 0.04×saturation), backdrop 96.1%; dark
  canvas 8% default, backdrop −2.5%; Figma accent/success/warning/danger/violet; selection ladder;
  `--font-sans` SF Pro first; body uses `--kit-font` and -0.15px tracking; `violet` utility.
- `kit.css`: per-theme role strengths (fg-muted, fg-subtle, fg-faint, line, line-strong, fill,
  fill-strong, line-hover); raised surface 6% (#212121 dark); 12/13/14/24 scale with 16/20/20/32
  line heights on phone and desktop (fields stay 16 on phones); Depth/Card ambient on `surface-card`.
- `appearance.ts`: `darkLightness` 8, `depth` on by default; stored settings carry `design: 2`;
  older saves move 9→8 and depth off→on once and are written back.
- `index.html` pre-paint + manifest: new canvases, depth on unless chosen off under generation 2.
- `button.tsx`: pill buttons; `palette.tsx` search uses `text-field`; gallery labels; DESIGN.md.

**Validation**

- `apps/console`: typecheck clean; lint 0 errors (pre-existing warnings only); 70 files / 459
  tests pass (appearance tests updated + migration write-back + light tint); build OK.
- Chromium probe at 1440×900 and 390×844, light and dark, `/design` and `/demo/inbox`: canvas
  #ffffff / #141414, backdrop #f5f5f5 / #0e0e0e, ink #292929 / #ebebeb, raised #212121, accent
  #2d7cf6, success #30a46c / #4bbe88, font SF Pro stack, tracking -0.15px, `data-depth="on"`.
  Only console error: the pre-existing 401 from `/auth/refresh` on the login page.

**Contract impact** — none (visual tokens only).

**Review** — independent reviewer agent: 1 high (pre-paint script / theme colours), 2 medium
(light tint lost at 100%; migration never persisted), 3 low (1-step shade drift, palette field
14px on phones, flat hover borders in dark), nits (violet utility, gallery labels, font list). All
fixed in this branch.

**Commit** — see branch `agent/ui-ux/figma-foundation`.
