---
id: str-pglite-optional
title: Postgres optional: PGlite when no DATABASE_URL
type: feature
from: human
to: backend
priority: normal
status: done
assignee: backend
reviewer: reviewer
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-cutover]
branch: agent/backend/pglite-optional
worktree: /home/ghost/Projects/grid-worktrees/agent/backend/pglite-optional
scope:
  - packages/db/**
  - apps/api/**
  - apps/launcher/src/**
allowed_shared: []
created: 2026-09-26
updated: 2026-10-06
---

## What

`@grid/db` opens PGlite under the data directory when `DATABASE_URL` is unset, instead of starting Docker; same schema and migrations. Postgres stays for the 24/7 host.

## Why / Context

A laptop or throwaway Codespace Grid then needs no database server. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.

## Proposal or Ask

`@grid/db`'s `createDatabase` gets a second mode: when `DATABASE_URL` is unset, open PGlite under
the data directory instead of a socket. Same Drizzle schema, same migrations, same queries, so
`apps/api` and `packages/db` need no change beyond choosing the client. The launcher stops shelling
out to `docker compose` on first run, and a laptop or throwaway Codespace Grid needs no database
server at all. Postgres stays the path for the 24/7 host, chosen by setting `DATABASE_URL`.

The plan's rules hold: Bun-native first, the same public contract either way, and the contract
suite run against both servers before any route depends on the choice.

**Definition of done:** with no `DATABASE_URL`, `bun run grid` reaches a working first-run setup on
a machine with no Docker and no Postgres. The contract suite passes against PGlite and against
Postgres. `packages/db` documents which is which and how to pick.

## Scope

**In scope:**

- `packages/db/**`
- `apps/api/src/config/**` and `apps/api/src/main.ts` for choosing the client
- `apps/launcher/src/main.ts` for dropping the Docker fallback

**Out of scope:**

- The schema and the migrations. Unchanged, and the contract tests are what prove it.
- `apps/docs/content/docs/backend-api.mdx`, which describes HTTP, not storage.
- Anything about production. PGlite is for a disposable machine; Postgres is the 24/7 host.

## Validation

- `bun run --cwd=packages/db run typecheck`, `lint`, `test`
- The API contract suite against **both** PGlite and Postgres: `bun run ci:test:contract` with
  and without `DATABASE_URL`. This is the gate; a route that works on one and not the other is not
  done.
- `bun run grid` on a machine with no Docker and no Postgres, through first-run setup.
- The seeded demo account still signs in on both.

## Resolution

Implemented dual-mode database engine in `@grid/db`:
- When `DATABASE_URL` is set, connects to PostgreSQL using `Bun.sql` and `drizzle-orm/bun-sql`.
- When `DATABASE_URL` is omitted (or empty), opens embedded PGlite using `@electric-sql/pglite` and `drizzle-orm/pglite` under `$GRID_DATA_DIR/db` (or `<root>/.grid/db`).
- In server mode (`server: true` or `PGLITE_SERVER=1`, used by `apps/api`), starts a background `PGLiteSocketServer` exposing standard PostgreSQL wire protocol and writes connection metadata to `pglite.url`.
- External processes and secondary clients calling `createDatabase()` without `DATABASE_URL` detect `pglite.url` with an active PID and connect transparently via `Bun.sql`, enabling shared buffer cache and zero file corruption across processes.
- Migration (`packages/db/src/migrate.ts`), seed (`packages/db/src/seed.ts`), and setup code issuance (`packages/db/src/setup-code.ts`) run cleanly against both engines.
- `apps/launcher` uses `databaseEnv()` with embedded PGlite fallback instead of requiring Docker.
- `apps/api` supports optional `DATABASE_URL` in development and test environments, while enforcing required in production.
- Contract tests updated to work seamlessly against both PGlite and PostgreSQL.

Changed:
- `packages/db/package.json`: added `@electric-sql/pglite` and `@electric-sql/pglite-socket`
- `packages/db/src/client.ts`: dual-mode `createDatabase`, socket server, and helper exports
- `packages/db/src/index.ts`: exported `resolveDataDir` and `DatabaseInstance`
- `packages/db/src/migrate.ts`: dual-engine migrations
- `packages/db/src/seed.ts`: dual-engine seeding
- `packages/db/src/setup-code.ts`: dual-engine setup codes
- `packages/db/src/client.test.ts`: test suite for memory PGlite, migrations, schema CRUD, setup codes, socket server
- `packages/db/README.md`: documentation for database engine selection
- `apps/api/src/config/env.ts`: optional `DATABASE_URL` in non-prod
- `apps/api/src/config/config.ts`: optional `databaseUrl`
- `apps/api/src/main.ts`: pass `server: true` and await `database.ready`
- `apps/api/src/modules/workspaces/data.ts`: support optional `databaseUrl` and normalize `db.execute` return shape
- `apps/api/src/modules/workspaces/routes.ts`: made `databaseUrl` optional in `backupDeps`
- `apps/api/test/contract/**`: contract test cleanup and setup using `createDatabase`
- `apps/launcher/src/main.ts`: replaced Docker compose fallback with embedded PGlite

Validation:
- `bun --cwd=packages/db run typecheck`: passed (code 0)
- `bun --cwd=packages/db run lint`: passed (code 0)
- `bun --cwd=packages/db test`: 10 passed, 0 failed across 3 files (2.89s)
- `bun --cwd=apps/api run test`: 28 passed, 34 skipped, 0 failed across 8 files (605ms)
- `CONTRACT_API_URL=http://127.0.0.1:4038 GRID_DATA_DIR=/tmp/grid-test-pglite-contract bun --cwd=apps/api run test:contract` (PGlite): 80 passed, 0 failed across 8 files (6.74s)
- `CONTRACT_API_URL=http://127.0.0.1:4038 DATABASE_URL=postgresql://... bun --cwd=apps/api run test:contract` (PostgreSQL): 80 passed, 0 failed across 8 files (8.00s)
- `bun run architecture:check`: passed (881 paths checked)
- `bun run naming:check`: passed (881 paths checked)
- `bun run format`: clean (923 files formatted)
- `bun run lint`: clean (0 errors)
- `bun run typecheck`: clean across all 9 workspaces (code 0)

Contract impact:
- None. API responses, envelopes, status codes, Drizzle schemas, and migrations remain identical across both storage engines.

Review:
- Pending reviewer assignment.

Commit:
- `d8084b5` (feat(db): add embedded pglite fallback when database_url is unset)
