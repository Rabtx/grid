---
id: str-pwa-improvement
title: PWA improvement: native-feeling launch and system chrome
type: feature
from: human
to: web
priority: high
status: doing
assignee: codex
reviewer: human
parent: none
depends_on: []
branch: agent/web/pwa-improvement
worktree: ../grid-worktrees/agent/web/pwa-improvement
scope:
  - apps/console/index.html
  - apps/console/src/lib/appearance.ts
  - apps/console/src/lib/appearance.test.tsx
  - apps/console/vite.config.ts
  - apps/console/src/pwa/service-worker.js
  - .agents/board/doing/2026-09-25-pwa-improvement.md
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Polish the installed console's first paint, system bar colour, and shell caching. Keep a checklist
of the broader native-feel ideas so the human can see what already exists and decide the next
slice.

## Easy slice checklist

- [x] Existing: viewport fit, standalone manifest, app icons, iOS status bar overlay, safe-area
  spacing, visual-viewport keyboard sizing, restrained motion, touch control styling, and a
  mounted app shell.
- [x] Set the saved light/dark class before the CSS loads to avoid a contrasting launch flash.
- [x] Keep theme-color aligned with the actual canvas, including manual theme/tint changes and
  system theme changes. Keep the design's canvas values rather than hard-code `#080808`.
- [x] Add the iOS home-screen title.
- [x] Precache only the app entry and its static dependencies; cache lazy route assets when used.
- [x] Verify light/dark launch, theme changes, offline shell, and mobile layout in a browser.

## Remaining decisions and larger work

- [ ] Test installed behavior, system bars, keyboard and safe areas on real iOS and Android
  devices; browser emulation is insufficient for those platform differences.
- [ ] Decide whether desktop window-controls-overlay improves the current title bar and whether
  the target browsers support it well enough.
- [ ] Design an IndexedDB snapshot and recovery policy for projects, tabs, conversations and
  pending operations. Do not cache private API responses in the service worker by default.
- [ ] Measure long sessions and virtualize only the lists that demonstrably need it.
- [ ] Evaluate Capacitor only when native-only capabilities are needed; it is optional.

## Validation

- `bun run --filter console test`: 29 files, 186 tests passed.
- `bun run --filter console build`: passed; precache has entry JS/CSS, icons and manifest,
  excludes chat, Markdown and terminal assets.
- `bun run lint`, `bun run typecheck`, `bun run format`, `bun run architecture:check`: passed.
  Lint reported only existing warnings outside console.
- Chromium production preview at 390×844: saved dark and light themes restored; custom black
  canvas and theme-color both matched `#000000`; system theme change updated theme-color from
  `#f7f7f7` to `#171717`; offline reload returned 200 with the Grid shell; no horizontal overflow.
- Real installed iOS and Android behavior remains unverified.

## Resolution

Changed: `index.html`, appearance logic and tests, the service-worker build plugin, and its
cache-policy comment. No API or schema contract changed. Production preview used port 3027.

Implementation commit: `743b4f3` (`feat(console): polish pwa launch and shell caching`).
Review: human reviewer requested through [PR #66](https://github.com/shabirkhan-dev/grid/pull/66);
outcome pending. Keep this card in `doing/`
until independent review and CI pass.
