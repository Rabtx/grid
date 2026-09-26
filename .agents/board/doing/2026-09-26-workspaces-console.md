---
id: str-workspaces-console
title: Workspaces: console URLs, switcher, setup and members
type: feature
from: human
to: web
priority: normal
status: doing
assignee: web
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-workspaces-data, str-workspaces-invites-setup]
branch: agent/frontend/console-redesign-shell
worktree: ../grid-worktrees/redesign
scope:
  - apps/console/**
allowed_shared: []
created: 2026-09-26
updated: 2026-09-27
---

## What

Workspace slug in console URLs (`/acme/board/web-app`), a workspace switcher, the first-run setup screens (account, workspace, first project, agents, invite), accepting an invite, and members and invites in settings. Built with the redesign.

## Why / Context

Fourth of four workspace cards; waits for the redesign. The model is in the plan's "Workspaces" section.

## Progress

Built in four PRs:

1. **Shell and switcher (this branch).** The screen is a canvas panel on a quieter backdrop on
   desktop, edge to edge on phones; the hue/saturation/lightness theme is kept. The sidebar
   opens with the workspace switcher (menu on desktop, bottom sheet on phones), then New chat,
   Search and Terminal, the projects, and an account menu (theme, settings, sign out). Creating
   a workspace is a sheet. The chosen workspace is remembered per device; API project calls go
   to `/workspaces/:ws/…`, runner requests carry `X-Grid-Workspace` and socket hellos a
   `workspace`, and the offline cache is kept per workspace. Switching reloads the console.
2. **Home and composer.** The composer is a raised card with round mic and send buttons and
   lighter model and mode pills; the folder and branch sit in a strip tucked under it. New chat
   titles the project with its icon and offers suggestions that fill the composer: a list under
   it on desktop, chips above it in thumb reach on phones.
3. Setup, invite acceptance and workspace URLs.
4. Members and invites in settings.

### Validation (PR 1)

- `bun run typecheck`, `bun run lint`, `bun run architecture:check`: pass.
- Console vitest: all files pass, including the new `active-workspace.test.tsx`.
- PR 2: console vitest passes (new composer fill test); checked new chat and a conversation on
  desktop and phone, light and dark.
- Browser, against a clone of the dev database: created a workspace (moved into it, empty
  project list), switched back to the default one; desktop and phone, light and dark.
