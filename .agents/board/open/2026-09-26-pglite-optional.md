---
id: str-pglite-optional
title: Postgres optional: PGlite when no DATABASE_URL
type: feature
from: human
to: backend
priority: normal
status: open
assignee: none
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-cutover]
branch: none
worktree: none
scope:
  - packages/db/**
  - apps/api/src/**
  - apps/launcher/src/**
allowed_shared: []
created: 2026-09-26
updated: 2026-09-27
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

Not started. Opened 2026-09-26 as a plan item, still waiting for a claim. Scope, validation and the
`Proposal or Ask` section were added 2026-09-27 by `2026-09-27-tier-1-unblock-trust`, which also
corrected `status` from the invalid `backlog` to `open` so it agrees with its folder, per
`.agents/board/README.md`.
