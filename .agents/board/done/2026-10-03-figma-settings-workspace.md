---
id: str-figma-settings-workspace
title: Settings match the Figma 24 workspace frames — General and Members
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-settings-you]
branch: agent/web/figma-settings-workspace
worktree: none
scope:
  - packages/db/src/schema/workspaces.schema.ts
  - packages/db/migrations/**
  - apps/api/src/modules/workspaces/**
  - apps/api/src/config/**
  - apps/api/src/app.ts
  - apps/api/src/main.ts
  - apps/api/test/contract/workspaces.test.ts
  - apps/runner/src/auth.ts
  - apps/runner/src/auth.test.ts
  - apps/runner/src/chat/**
  - apps/runner/src/automations/routes.ts
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
  - apps/console/src/modules/settings/**
  - apps/console/src/modules/workspaces/**
  - apps/console/src/modules/chat/components/chat-screen.tsx
  - apps/console/src/kit/settings.tsx
  - apps/console/src/kit/avatar.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/app.tsx
created: 2026-10-03
updated: 2026-10-03
---

## What

The workspace part of Figma "24 · Settings": General and Members, on desktop and phones, with the
backend each needs. Connectors (the catalog, the GitHub page, the connect flow and custom MCP
servers) follow in their own card.

## Scope

**Left for later:** seats (Grid has no seat limits, so the line counts people; "Upgrade" is
left out); "Week starts on" is saved for the board, automations and reports to read.

## Resolution

**API** — a migration adds `logo_url` and `settings` to workspaces. Settings (default branch and
agent, week start, run-log retention, who may start each agent) merge on PATCH; the list and the
workspace carry them. `POST /:ws/logo` (stored as `/uploads/logos/…`), `GET /:ws/data` (Postgres
version, size, host, backups), `POST /:ws/backups` (`pg_dump` custom format into Grid's data
folder, seven kept) and a nightly backup after 3 AM, `GET /:ws/export` (projects, tasks, notes as
JSON), `POST /:ws/invites/:id/resend` (a fresh link, emailed again); members carry their email.

**Runner** — the token check carries the person's role and the workspace's settings. Agents kept to
admins refuse members (threads and automations); new worktrees start from the default branch when
the repository has it; threads untouched past the retention are cleared hourly (worktree or live
ones stay); `GET /agents/usage` counts people per agent and the roles on it.

**Console** — General: logo and name, address with copy, default branch, default agent, week start,
database health, backups with Back up now, run-log retention, export, transfer ownership and
delete (the name typed first). Members: invite card (several emails, a role, Send invite; an invite
link), people with email, role picker and menu, pending invites with Resend and Revoke, agents with
who may start them and who uses them. The composer starts with the workspace's default agent and
hides agents a member may not start. Phones: Figma's rows, values with chevrons and sheets.

## Validation

- `bun run lint` 0, `bun run typecheck` 0, `vite build` OK.
- Console vitest 547 tests (new: general ×2; members ×5 rewritten for the new screen).
- Runner 358 pass (new: role and settings on the token check, agent access, retention and usage,
  default-branch worktree).
- API 28 unit; contract tests against this branch's API: workspaces and invites 13 pass (new:
  settings merge and validation; data status, export and logo). A real `pg_dump` backup was taken
  through the API.
- Chromium against this branch's API and runner: desktop General and Members, phone General and
  Members.
