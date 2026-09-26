---
id: str-workspaces-data
title: Workspaces: data model and API
type: feature
from: human
to: backend
priority: high
status: done
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-cutover]
branch: agent/backend/workspaces-data
worktree: ../grid-worktrees/agent/backend/workspaces-data
scope:
  - packages/db/**
  - apps/api/**
  - apps/docs/content/docs/backend-api.mdx
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Workspaces own the work. Add `workspaces` and `workspace_members` (owner, admin, member); projects (with their tasks and notes) and subscriptions belong to a workspace; a migration gives every existing user a personal workspace holding their projects and subscription. API: list, create, read and update workspaces; list members, change roles, remove members (one owner always remains); projects, tasks and notes under `/workspaces/:ws/projects/...`, with today's `/projects/...` kept as the user's default workspace so the current console keeps working until it moves to workspace URLs.

## Why / Context

First of four workspace cards; agreed with the human on 2026-09-26. The model is in the plan's "Workspaces" section.

## Done

- `workspaces` + `workspace_members` (owner/admin/member). Migration 0007 creates them and gives
  every existing user a personal workspace (slug from the username; reserved names and clashes
  get a suffix) holding their projects and subscription; 0008 drops `projects.owner_id` and makes
  `workspace_id` required. Projects keep `created_by`.
- `@grid/db/workspaces`: slug rules, `defaultWorkspaceOf`, `createPersonalWorkspace` (used by
  the API, the seed and the first-run owner script).
- API `/workspaces` (list, create, get, update, delete; members list, role change, remove/leave,
  always one owner), projects/tasks/notes under `/workspaces/:ws/projects`, bare `/projects` as
  the default workspace (made on first use). Billing reads and writes per workspace; checkout and
  portal need the owner; webhooks carry `workspaceId` and fall back to the payer's default
  workspace for older checkouts.
- Not a member answers 404, same as missing.

## Validation

- Migrations 0007+0008 on a clone of the dev database: 6 users → 6 workspaces, 6 owners, 4/4
  projects moved, none without a creator.
- `bun test src` (api): 45 pass. `packages/db` tests: 4 pass.
- Contract suite against the worktree API on :4107: 67 pass, 0 fail (6 new workspace tests).
- `bun run lint`, `bun run typecheck`, `bun run architecture:check`: pass.
