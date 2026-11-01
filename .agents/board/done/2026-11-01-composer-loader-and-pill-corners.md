---
id: str-composer-loader-pill-corners
title: boardui composer loader in the composer, and a pill corner style that reaches every control
type: feature
from: human
to: web
priority: normal
status: done
assignee: web
reviewer: ui-ux
parent: none
depends_on: []
branch: ccr-d4ce2b6f-zgf6aj
worktree: none
scope:
  - apps/console/src/kit/**
  - apps/console/src/lib/appearance.ts
  - apps/console/src/lib/appearance.test.tsx
  - apps/console/src/modules/settings/components/appearance-screen.tsx
  - apps/console/src/routes/design-gallery.tsx
allowed_shared:
  - packages/tokens/src/kit.css
  - DESIGN.md
created: 2026-11-01
updated: 2026-11-01
---

## What

Replace the composer's conic-sweep "lit" effect with BoardUI's Composer Loader, and make
Settings → Appearance → Corners actually reach the composer's buttons and other controls, with a
new **pill** style beside round, soft and square.

## Why / Context

The conic sweep sped up on the card's short ends and slowed on its long sides. The composer's
toolbar and the icon tiles used the card corner (`rounded-kit`, 8px × scale), so round and soft
barely differed there and nothing could make them pills.

## Proposal or Ask

- Port `boardui add composer-loader` (React) to a Solid 2 kit component, `ComposerLoader`, which
  takes its corner from the card so it follows the corner style.
- Add `--kit-radius-tile` / `rounded-tile` for icon tiles and composer controls, and a `pill`
  corner style that turns tiles into circles and capsules and rounds cards a quarter more.

## Scope

**In scope:** the paths above.

**Out of scope:** list rows, menus and tiny in-row glyph buttons, which keep the card corner.
`rounded-full` uses are shapes (dots, tracks, avatars, radio marks) and stay round.

## Validation

- `bun run --filter console typecheck`: exit 0
- `bunx vitest run` in apps/console: 148 files, 797 tests passed
- `bun run --filter console lint`: exit 0 (pre-existing warnings only); `architecture:check` passed
- Playwright against the Vite dev server: PromptBox working and idle under pill, round, soft and
  square at 900px and 390px; the band's `rx` follows the corner style (0 in square), and the
  animation runs only while active

## Resolution

Landed on `ccr-d4ce2b6f-zgf6aj`: `kit/composer-loader.tsx`, the `kit.css` corner tokens, the
`pill` option in `lib/appearance.ts` and the settings screen, and the DESIGN.md corner rules.
