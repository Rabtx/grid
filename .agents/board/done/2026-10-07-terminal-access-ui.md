---
id: grid-terminal-access-ui
title: show terminal entry points only to roles that may open a terminal
type: bug
from: pm
to: frontend
priority: medium
status: done
assignee: claude
reviewer: human
parent: grid-runner-access-control
depends_on: []
branch: agent/frontend/terminal-access
worktree: none
scope: [apps/console/src/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

Since #197 the runner opens terminals only for roles with the `machines` permission (owners and admins by default), but the console still showed terminal buttons to everyone, and members got a "can't do this" error when they pressed one.

## Resolution

Done by claude, 2026-10-07.

- **The check:** `useTerminalAccess()` (in `modules/workspaces`) uses the same `machines` permission as the runner, including Settings → Roles changes.
- **Hidden without access:**
  - the rail's Terminal item and the `g t` shortcut;
  - the palette's "Open terminal here";
  - "Open terminal" on a failed run;
  - Machines → Terminals, whose list is no longer requested;
  - the agent Install and Sign in buttons (the install how-to link shows instead).
- **Explained instead:** `/terminal` and the split view's terminal pane say why there's no terminal, and xterm.js isn't downloaded.
- **Tests:** the check across owner, admin, member, viewer and custom roles, and the failed-run card without access. Console 710 / 710, typecheck and lint pass.
