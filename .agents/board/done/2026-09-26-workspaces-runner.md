---
id: str-workspaces-runner
title: Workspaces: runner state belongs to the workspace
type: feature
from: human
to: backend
priority: normal
status: done
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-workspaces-data]
branch: agent/backend/workspaces-runner
worktree: ../grid-worktrees/agent/backend/workspaces-runner
scope:
  - apps/runner/**
  - apps/api/**
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

The runner keys project folders, chats and environments by user today. Key them by workspace, so teammates in one workspace share a project's folder, threads and environments, with access checked through workspace membership.

## Why / Context

Third of four workspace cards. The model is in the plan's "Workspaces" section.

## Done

- **Identity**: the runner resolves `{ userId, workspace }` for every request and socket. It asks
  the API who the token is (`/auth/me`) and which workspaces they are in (`/workspaces`, now
  with each workspace's `id` and an `isDefault` flag), cached 30 s. The workspace comes from
  `X-Grid-Workspace` (HTTP) or `workspace` in the hello (sockets), else the default one. Not in
  that workspace: 404, and the console is not signed out.
- **Workspace-owned**: chats (a `workspace_id` on sessions; `owner_id` stays as who started it, for
  notifications), project folders and environments with their project placements (columns
  renamed `owner_id` → `workspace_id`). Teammates see and use the same threads, folders and
  environments; another workspace's chat answers like one that does not exist.
- **Personal**: terminals, agent settings, push notifications, the GitHub sign-in. A Codespace
  connected becomes one of the workspace's environments.
- **Adoption**: rows kept per person before workspaces keep that person's id as their key until
  they act in their default workspace, which moves them in (a folder the workspace already has for
  a project wins). Runs on each default-workspace request; after the first it finds nothing.
- **Pairing**: a home Grid pairs an environment under its workspace id, so what runs there is
  kept per home workspace. Environments paired before keep their person key.
- The console needs no change yet (no header means the default workspace); the workspace switcher
  comes with the workspaces-console card.

## Validation

- Runner tests: 108 pass (new `workspaces.test.ts`: sharing between teammates, isolation between
  workspaces, adopting a database in the old shape, with its folders and environments).
- A copy of the live chat database opened with the new code: 7 chats and 3 folder links under the
  person's id, all moved into the workspace by adoption.
- End to end, this branch's API and runner against a copy of the live chat database: the demo
  account's workspace list has `demo` as default with its id; `/projects/folders` and the grid
  chats (5) came back under the workspace after adoption; an unknown `X-Grid-Workspace` 404; no
  token 401; terminals 200.
- API contract (workspaces + projects) on a database clone: 11 pass.
