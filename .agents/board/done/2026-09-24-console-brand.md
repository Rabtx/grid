---
id: str-console-brand
title: Grid logo, favicon and home-screen icon in the console
type: feature
from: human
to: ui-ux
priority: normal
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/ui-ux/console-brand
worktree: ../grid-worktrees/agent/ui-ux/console-brand
scope:
  - apps/console/public/**
  - apps/console/index.html
  - apps/console/src/ui/brand.tsx
  - apps/console/src/ui/index.ts
  - apps/console/src/modules/shell/components/project-nav.tsx
  - apps/console/src/routes/app-shell.tsx
  - apps/web/AGENTS.md
  - apps/web/CLAUDE.md
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Bring the Grid brand into the console: the wordmark in the sidebar, drawer and signed-out header,
a favicon, an Apple touch icon and a web app manifest so the console installs to a phone's home
screen with the Grid mark. Also commit `apps/web/AGENTS.md` / `CLAUDE.md`, which `next dev`
regenerates on every run (the file itself says to commit it).

## Resolution

- Assets derive from the human's originals already in the repo (`apps/web/public/brand/grid-logo.png`
  1997×788, `grid-mark.png` 512×512) with ImageMagick — resized, never redrawn:
  `grid-logo-480.png` (44 KB, was 460 KB), `grid-mark-96.png`, `favicon-64.png`, and the mark
  flattened onto the dark canvas `#171717` at 62% with padding for launcher masks:
  `app-icon-192.png`, `app-icon-512.png`, `apple-touch-icon.png` (180).
- `ui/brand.tsx`: `BrandLogo` / `BrandMark` with the same light-mode fix as `apps/web`
  (`invert hue-rotate-180`, untouched in dark).
- `index.html`: favicon, touch icon, manifest, `apple-mobile-web-app-*` meta, and `theme-color`
  corrected to the current canvas colours (`#f7f7f7` / `#171717`; the old values came from the
  retired tokens).
- Validation: console tests `33 passed (33)`, typecheck 0 errors, lint clean, build ships
  `dist/brand/*` and `dist/manifest.webmanifest`. Browser: 1280px dark and light — wordmark in the
  sidebar, light mode inverted with the mint petal intact; 375px light — wordmark in the drawer.
