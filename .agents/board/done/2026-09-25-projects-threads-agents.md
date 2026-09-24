---
id: str-projects-threads-agents
title: Projects are folders with threads; chats work in the project folder; Settings → Agents
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: [str-projects-as-workspaces]
branch: agent/ui-ux/projects-threads-providers
worktree: ../grid-worktrees/agent/ui-ux/projects-threads-providers
scope:
  - apps/runner/src/agents/**
  - apps/runner/src/chat/**
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/shell/**
  - apps/console/src/modules/settings/**
  - apps/console/src/routes/**
  - apps/console/src/app.tsx
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

A project is a folder: it opens and closes in the sidebar to show its threads, which can be
renamed and deleted. Threads must work in the project's folder. Agents' model lists should be
kept rather than asked for on every thread, refreshed from a new Settings → Agents page that
also holds each agent's defaults.

## Resolution

- Sidebar: projects are folders that open and close (remembered) to list their threads; the
  current project is always open; project menu (New thread, Rename, Change folder, Open board,
  Remove from Grid) and thread menu (Rename inline, Delete with confirmation). The second panel
  is gone; phones get the same tree in the drawer. Threads come from one shared store, so a new
  thread or a rename shows everywhere at once.
- Workspace: Antigravity ignored the process folder and ran with no workspace; it now gets
  `--add-dir <project folder>`. New threads send the project folder explicitly; a project with
  no folder cannot start a thread (the runner answers 409 instead of falling back to home, and
  the composer asks you to choose the folder). Resumed threads keep the folder they started in.
- Runner: model lists are kept in `provider_catalogs` and asked of an agent only the first time
  or on `POST /chat/providers/:id/refresh`; per-person settings in `provider_settings` via
  `PUT /chat/providers/:id/settings` (enabled, model, effort, mode). Tests in `chat/hub.test.ts`.
- Console: the agent list is read once per visit (and shown from the last copy at once);
  Settings → Agents lists each agent with install state, model count and last refresh, a
  Refresh models button, an on/off switch for new threads, and the model, effort and mode new
  threads start with (searchable pickers). New threads honour these defaults.

Validation: runner 43 tests, console 158 tests, lint, typecheck and architecture clean;
Playwright at 1440×900 and 390×844 with a mocked runner: tree open/close, inline rename (one
PATCH), delete (DELETE, falls back to a new thread), no-folder banner with Send disabled, new
thread POST carries the folder, Refresh models (POST, list grows), agent switch (PUT); no
console errors or strict warnings.
