---
id: str-hono-foundation
title: Hono foundation: shared db package, API skeleton, forwarding, contract tests
type: feature
from: human
to: backend
priority: high
status: done
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

## Outcome

- `packages/db` (`@grid/db`): the schema, migrations, migrate, seed and owner scripts, moved from
  NestJS unchanged, on `Bun.sql` (Drizzle `bun-sql`) and `Bun.password` (bcrypt, cost 12, so every
  existing hash and NestJS's bcryptjs checks still work). NestJS imports the schema from here and
  keeps its own client until the cutover.
- `apps/api`: Hono on `Bun.serve` with the NestJS contract: envelope, error body, `x-request-id`,
  security headers, CORS with the same origin rules, a 100/min rate limit, zod validation errors,
  `requireUser` (HS256 access token, live session, active user), and `GET /api/v1/health`.
  Everything else under `/api` and `/uploads` is forwarded to NestJS unchanged.
- The launcher runs Hono on the API port and NestJS behind it on port+10; `bun run dev` does the
  same (NestJS on 4010). The standalone NestJS image now runs its sources on Bun.
- `apps/api/README.md` is the porting guide for the lane cards.

## Validation

- `bun run typecheck`: all 9 packages exited 0. `bun run lint`: exited 0.
  `bun run architecture:check`: passed.
- apps/api `bun test src`: 13 passed (envelope, request ids, 404 shape, CORS, requireUser cases,
  validation errors, 429 with Retry-After, forwarding with cookies both ways).
- Contract suite (`bun test test/contract`): 5/5 against NestJS and 5/5 against Hono. It caught
  one difference first (NestJS puts the query string in the 404 message); Hono now matches.
- Sign-in round trip (demo account) through Hono's forwarding and through a full `bun run grid`
  on spare ports: login 200 with the refresh cookie, refresh 200, projects 200, same as NestJS.
- apps/nest-api tests: 26 passed on the moved schema. apps/launcher tests: 4 passed.
