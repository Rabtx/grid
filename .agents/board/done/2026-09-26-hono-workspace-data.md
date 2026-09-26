---
id: str-hono-workspace-data
title: Hono: projects, tasks, notes and profiles
type: feature
from: human
to: backend
priority: normal
status: done
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-foundation]
branch: agent/backend/hono-workspace-data
worktree: /home/ghost/Projects/grid-worktrees/agent/backend/hono-workspace-data
scope:
  - apps/api/src/modules/projects/**
  - apps/api/src/modules/profiles/**
  - apps/api/test/contract/projects*
  - apps/api/test/contract/profiles*
allowed_shared:
  - apps/api/src/app.ts
  - apps/api/src/config/config.ts
  - apps/api/src/config/env.ts
created: 2026-09-26
updated: 2026-09-26
---

## What

Port `modules/projects` (projects, tasks with per-project numbering under a row lock, notes) and `modules/profiles` (profile update, avatar upload stored under `uploads/` and served at `/uploads/...`). Same routes, bodies, status codes and validation errors.

## Why / Context

Parallel lane for an agent once the foundation is merged. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.

The app mount requires `app.ts`; the shared uploads path requires the two config files.
The merged auth core already injects the database. No `src/http/*` or `packages/db` changes are needed.

## Delivery

Changed:
- `apps/api/src/modules/projects/**`: project, task and note routes, validation, queries and unit tests.
- `apps/api/src/modules/profiles/**`: profile routes, avatar upload and file serving.
- `apps/api/test/contract/projects.test.ts`, `profiles.test.ts`: black-box tests with cleanup.
- `apps/api/src/app.ts`, `config/config.ts`, `config/env.ts`: mounts and `GRID_UPLOADS_DIR`. Default uploads path is `apps/nest-api/uploads`.

Validation (worktree root unless noted; real command output):
- `bun run typecheck`: exit 0; `api`, `nest-api`, `web`, `console`, `runner`, `launcher`, `@grid/db`, `@grid/ui`, `@grid/logger` typecheck exited 0.
- `bun run lint`: exit 0; `api lint: Exited with code 0`; ShellCheck passed. Existing warnings in docs, UI and web.
- `bun run format`: exit 0; `Finished in 65ms on 597 files using 4 threads`; shfmt completed.
- `bun run architecture:check`: exit 0; `Architecture checks passed.`; `[naming] OK (600 path(s) checked)`.
- `CONTRACT_API_URL=http://127.0.0.1:4022 bun --cwd=apps/api test`: `56 pass`, `0 fail`, `265 expect() calls`, 8 files.
- From `apps/api`: `CONTRACT_API_URL=http://127.0.0.1:4021 bun test test/contract`: `29 pass`, `0 fail`, `150 expect() calls`, 4 files.
- From `apps/api`: `CONTRACT_API_URL=http://127.0.0.1:4022 bun test test/contract`: `29 pass`, `0 fail`, `150 expect() calls`, 4 files. It waited for a login throttle and completed in 63.95s.
- `bun --cwd=apps/nest-api run test`: `Test Files 7 passed (7)`, `Tests 26 passed (26)`.

Contract impact: none; existing routes, success and error envelopes, status codes and validation messages are preserved. No package added.

Review: human reviewer pending. Local comparison ports: NestJS 4021, Hono 4022.

Commit: `90b3435` implementation; `b31d25c` card claim (rebased onto auth core at `405eb91`).

During validation, a bare `bun --cwd=apps/api test` used the contract client's default port 4000 once. The test avatar it created on the live service was identified by its unique filename and removed. Subsequent runs pinned `CONTRACT_API_URL` to 4022.

## Review

Reviewed and merged in #94 by the lead agent. Both lanes were combined on main and checked
together: typecheck 9/9, lint and architecture clean, apps/api unit tests 39 passed, and the
whole contract suite 48/48 against NestJS and 48/48 against Hono. The only conflict (both lanes
mounting routes in `app.ts`) was resolved by keeping both, and main's tree is identical to the
tested one.
