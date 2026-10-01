---
id: str-figma-shell
title: Console shell matches the Figma rail, panel, top bar and mobile dock
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-foundation]
branch: agent/web/figma-shell
worktree: none
scope:
  - apps/console/src/modules/shell/**
  - apps/console/src/kit/nav.tsx
  - apps/console/src/kit/frame.tsx
  - apps/console/src/kit/button.tsx
  - apps/console/src/kit/icons.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/routes/app-shell.tsx
  - apps/console/src/routes/app-shell.test.tsx
  - apps/console/src/routes/app-shell-inbox.test.tsx
  - apps/console/src/modules/settings/components/settings-sidebar.tsx
created: 2026-10-01
updated: 2026-10-01
---

## What

Replace the single labeled sidebar with the Figma shell: an icon rail (Home, Inbox, Threads,
Board, Files, Notes, Terminal, Browser, PRs, Ship, Automations; Machines, Agents, Settings,
Account at the foot), a contextual panel beside it, a top bar with breadcrumb, and on phones a
header, drawer and a bottom dock that hugs its content with 8px padding.

## Why / Context

Second card of the human's request to replace the console UI with the Figma design exactly
(file `Dx4ZZ1v693wRzVDKzunhQA`). Rail items without a backend yet are left out, not faked.

## Validation

- Console typecheck, lint, tests, build; screenshots at 1440 and 390, light and dark.

## Resolution

**Changed**

- New `Rail` (76px): the mark (toggles the panel; `aria-expanded`), Inbox (dot + spoken unread
  count), Threads, Board, Files, Notes, Terminal, Pull requests, Automations; foot Machines,
  Agents, Settings and a compact account menu. Home, Browser and Ship are left off until their
  screens exist.
- `Sidebar` is now the 220px panel: section title with Search and New thread, workspace switcher,
  projects tree, and a `MachineCard` (runner online/offline) at the foot. Settings keep their own
  panel with a Back to app action.
- Kit: `RailLink`, `RailButton`, `railItem`, `PanelHeader`, `BrandTile`, `MachineCard`; nav rows
  13px medium with the flat `bg-selection`; icon buttons gain `shape` (square/round) and `lg`
  (44px); Figma icons (kanban board, bolt, laptop, asterisk); `AppFrame` takes `rail`, with rail
  and panel on bg/subtle.
- Desktop top bar 52px with breadcrumb; phone header with round 44px buttons; drawer shows rail
  and panel side by side. Inbox count fetch moved to the shell so the rail dot and app badge work
  with the panel folded.

**Validation**

- `apps/console`: typecheck clean; lint 0 errors; 70 files / 459 tests (kit guard included); build OK.
- Chromium at 1440×900 and 390×844, light and dark: Inbox, Board, Settings, phone header and
  drawer. No console errors besides the pre-existing `/auth/refresh` 401 on the login page.

**Contract impact** — none.

**Review** — independent reviewer agent: 2 medium (unread dot depended on the panel mounting;
count not spoken), lows (Back to app lost, double border when folded, "This machine" wording,
landmark name, aria-expanded, safe-area padding). All fixed except Files/Notes/PRs falling back
to the board with no project (inherited behaviour, left for the screen cards).

**Follow-ups** — screens still draw their own pane header under the top bar; each screen card
moves its title and actions into the top bar per its Figma frame.
