---
id: str-hono-foundation
title: Hono foundation: shared db package, API skeleton, forwarding, contract tests
type: feature
from: human
to: backend
priority: high
status: in_progress
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: []
branch: agent/backend/hono-foundation
worktree: ../grid-worktrees/agent/backend/hono-foundation
scope:
  - packages/db/**
  - apps/api/**
  - apps/nest-api/**
  - apps/launcher/src/**
  - package.json
  - .agents/ownership.yaml
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

- Move the Drizzle schema, migrations, migrate, seed and owner scripts from `apps/nest-api/src/database` to `packages/db` (`@grid/db`), with a `Bun.sql` client factory. NestJS imports the schema from there and keeps its own postgres-js client until it is deleted.
- `apps/api`: Hono on `Bun.serve`. Env config (zod, same variables and defaults as NestJS), the success envelope and error body, `x-request-id`, security headers, CORS, rate limiting, zod validation, the access-token check (`requireUser`), and forwarding of every unported `/api/*` and `/uploads/*` request to NestJS.
- Contract harness in `apps/api/test/contract/` that runs against any base URL, proven on both servers.
- Port `GET /api/v1/health`.
- Dev and launcher run `apps/api` on the API port with NestJS behind it.

## Why / Context

Everything else in the plan builds on this. See [api-on-hono](../../plans/api-on-hono.md). Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.
