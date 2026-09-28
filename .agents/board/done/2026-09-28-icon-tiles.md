---
id: str-icon-tiles
title: "Icon tiles: a background behind every standalone icon, and one icon size scale"
type: feature
from: human
to: ui-ux
priority: normal
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/ui-ux/icon-tiles
worktree: ../grid-worktrees/agent/ui-ux/icon-tiles
scope:
  - DESIGN.md
  - packages/tokens/src/kit.css
  - apps/console/src/kit/**
  - apps/console/src/modules/shell/components/sidebar.tsx
  - .agents/board/**
allowed_shared: []
created: 2026-09-28
updated: 2026-09-28
---

## What

Standalone icons (New chat, the projects "+", the composer's attach, search, close, refresh, row
⋯ menus…) looked like stray glyphs, and icons in buttons came in several sizes.

## Proposal or Ask

- `icon-tile` utility: a soft fill and hairline (lit top edge with depth on). The default `ghost`
  look of `iconButton`, so every `IconButton` and `iconButton()` trigger gets it; `bare` keeps the
  old look for icons inside another control.
- Hand-built icon buttons move onto the recipe: dialog close, alert dismiss, pane back, the tab
  bar's new tab, pagination. The composer's add, tools and mic and the menu icon trigger use the
  tile too. New chat in the sidebar shows its icon on a tile.
- The button sets its icon's size (`ICON_SIZE`): 16px in `sm`/`md`, 14px in `xs`, one step larger
  on touch; a stray `size="lg"` or `class="size-3.5"` on an icon no longer changes it.
- `DESIGN.md` documents both rules.

## Validation

- `bun run lint`, `bun run typecheck`, `bun run format`, `bun run architecture:check`: pass.
- Console `bunx vitest run`: 66 files, 441 tests pass; `bun run build` passes.
- Browser, dark and light at 1280 px and 375 px: sidebar (search, collapse, New chat, projects
  "+"), composer (+, mic), phone top bar.

## Resolution

Merged as #145 after the human tried the branch. Follow-ups on review: every tile is 28px with the
kit's 8px corner (matching the chips beside it), and every corner in the kit and stylesheets now
follows the corner roundness slider, with a guard test against fixed corners.
