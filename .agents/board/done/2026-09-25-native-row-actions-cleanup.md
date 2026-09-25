---
id: str-native-row-actions-cleanup
title: Row menus the native way per device, and a cleaner console on phones and desktops
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/ui-ux/native-row-actions
worktree: ../grid-worktrees/agent/ui-ux/native-row-actions
scope:
  - apps/console/src/ui/**
  - apps/console/src/modules/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Three-dot buttons showed everywhere, including on touch screens. On desktops they should appear
only on hover (or keyboard focus); phones and tablets should use a long press, like native apps.
Clean up other clutter while at it.

## Resolution

- `ui/context-menu.ts` `attachContextMenu`: right-click (and the keyboard menu key) on desktops,
  a 450 ms long press on touch with a short vibration; the click ending a long press is
  swallowed; the menu opens on release (a light-dismiss popover would close at once otherwise).
- `Menu` gains `pointerOnly` (the ⋯ trigger is hidden on coarse pointers) and `control` (open
  from code, at a point on md+, as a bottom sheet on phones).
- Sidebar project and thread rows and board task cards: ⋯ (and the project row's +) only on
  hover or focus with a pointer; right-click or long press opens the same menu; iOS link
  callouts and text selection are off on those rows.
- Cleanup: phone board lanes no longer repeat the stage tabs' names, the task total is not
  repeated (only "n of m" while filtering), empty lanes show a quiet "No tasks" instead of a
  dashed box, the desktop title bar drops the duplicated "Project — Grid", Settings pages drop
  headings that repeat their tab (kept for screen readers), "Refresh models" is icon-only on
  phones, the disabled attach button left the composer, and the status bar is desktop-only on
  phones unless the runner is offline. Fixed a strict-read warning in the conversation.

Validation: console 184 tests, typecheck and lint clean; Playwright at 1440×900 and 390×844: no
⋯ at rest, one on hover, right-click opens the menu at the pointer, a real CDP long press opens
the bottom-sheet menu on a thread and on a task card without navigating, a tap still opens the
thread; no console errors.
