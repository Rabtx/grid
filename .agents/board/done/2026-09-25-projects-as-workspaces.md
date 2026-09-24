---
id: str-projects-as-workspaces
title: Projects are workspaces — picking one opens its chats, with rename, folder and remove
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: [str-console-shell-match, str-project-folders]
branch: agent/ui-ux/project-workspaces
worktree: ../grid-worktrees/agent/ui-ux/project-workspaces
scope:
  - apps/console/src/modules/projects/**
  - apps/console/src/modules/shell/**
  - apps/console/src/modules/chat/components/chat-screen.tsx
  - apps/console/src/modules/chat/components/session-list.tsx
  - apps/console/src/modules/auth/components/login-form.tsx
  - apps/console/src/routes/**
  - apps/console/src/app.tsx
  - apps/console/src/ui/menu.tsx
  - apps/console/src/ui/index.ts
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Switching project from the sidebar opened that project's board. A project is a folder with its
chats in it: picking one should open where you left it, and the project needs the everyday
actions (rename, change folder, remove).

## Resolution

- Picking a project opens its last chat (remembered per project), else a new chat; `/` and
  `/chat` do the same; `/board` still opens the board, and "Open board" is in the project menu.
- Each project row has a menu: Rename, Change folder, Open board, Remove from Grid (archives the
  project through `PATCH /projects/:slug`; its folder and chats are untouched). Archived
  projects are hidden.
- Phones: the drawer lists the current project's chats (and New chat) under it; desktop keeps
  them in the workspace panel.
- Add project: pick the folder, confirm the name; the short name (made unique) and repository
  are filled in and tucked under "More".
- A remembered chat that no longer exists falls back to a new chat; the empty state offers
  Add project; sign-in lands on `/`.

Validation: console 158 tests pass, typecheck and lint clean; Playwright at 1440×900 and 390×844:
`/` → `/chat/grid`, project switch → `/chat/shop-app`, back → last chat `/chat/grid/g2`, nested
chats in the drawer, rename and remove PATCH calls, add-project create + link; no console errors.
