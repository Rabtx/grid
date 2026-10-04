---
id: str-floating-sidebar
title: The floating sidebar from Figma 09 · Threads, as an Appearance choice
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/floating-sidebar
worktree: none
scope:
  - apps/console/src/kit/nav.tsx
  - apps/console/src/kit/frame.tsx
  - apps/console/src/kit/pane.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/lib/appearance.ts
  - apps/console/src/lib/appearance.test.tsx
  - apps/console/src/modules/shell/**
  - apps/console/src/modules/environments/components/machine-badge*.tsx
  - apps/console/src/modules/environments/index.ts
  - apps/console/src/modules/settings/components/appearance-screen.tsx
  - apps/console/src/modules/settings/components/settings-sidebar.tsx
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/routes/app-shell.tsx
created: 2026-10-04
updated: 2026-10-04
---

## What

The Figma "Desktop · Floating sidebar" frames (09 · Threads): instead of the rail and panel down
the side, one canvas under a borderless top bar, the sidebar a card floating over it.

## Scope

Desktop only (from `lg`); phones keep their header and drawer. Settings → Appearance → Sidebar
chooses Full (the default, unchanged) or Floating, per device like the rest of Appearance.

## Resolution

**Top bar** — the sidebar's toggle, the workspace switcher (its mark and name; other workspaces,
Create workspace, Open a folder as a project), then the screen's tabs or breadcrumb and actions;
search, the Inbox (bell, with its dot) and the account menu on the right.

**Card** — 232px, 16px in: the views row (every destination as a 24px icon, the current one
raised), a hairline, then the screen's own panel (with its actions under the section's name), the
projects and their threads, or in Settings its pages. As tall as it holds; scrolls inside.

**Canvas** — Settings at the lower left, this machine ("omarchy · online", from `GET /machine`)
at the lower right, kept off screens that fill the canvas edge to edge except threads. A thread's
Run and Changes float as a card on the right (`DetailAside`), so the conversation is centred.

Kit: `railItem` gains `row` and `bar` sizes; `FloatingPanel`, `CanvasCorner`, `DetailAside`;
`AppFrame` takes `floating` and `corners`.

## Validation

- `bun run lint` 0, `bun run typecheck` 0, `bun run architecture:check` OK, `vite build` OK.
- Console vitest 557 (new: floating top bar and card ×3, machine badge ×2, appearance sidebar).
- Chromium against this branch's API and runner, 1440 and 1024 wide, light and dark: a thread
  (card, Run card, machine), Home, Settings → Appearance, the toggle hiding and showing the card;
  phone unchanged; Full sidebar unchanged.
