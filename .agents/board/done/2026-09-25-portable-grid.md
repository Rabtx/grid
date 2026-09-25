---
id: str-portable-grid
title: portable grid — one command on a laptop, a vps or a codespace
type: feature
from: human
to: backend
priority: high
status: done
assignee: backend
reviewer: human
parent: none
depends_on: []
branch: agent/backend/portable-grid
worktree: ../grid-worktrees/agent/devops/portable-grid
scope:
  - apps/launcher/**
  - apps/nest-api/src/database/owner.ts
  - apps/console/vite.config.ts
  - .devcontainer/**
  - docker/**
  - apps/docs/content/docs/portable.mdx
allowed_shared:
  - package.json
  - .gitignore
  - .agents/ownership.yaml
created: 2026-09-25
updated: 2026-09-25
---

## What

Make Grid one disposable, reproducible bundle: the same checkout runs from a single command on a
laptop, a VPS or a GitHub Codespace, serving everything behind one port.

## Why / Context

Grid has to run anywhere and later connect to other Grid instances as environments. Until now it
took several dev servers, a hand-made `.env`, a running Postgres and an email-verified account.

## Proposal or Ask

`bun run grid` prepares a fresh machine (data dir, secrets, Postgres, migrations, owner account,
console build) and supervises API + runner + a single gateway port. Codespaces and Docker wrap it.

## Scope

**In scope:** the launcher, the owner bootstrap, gateway allowed hosts, dev container, VPS image,
docs.

**Out of scope:** Nest → Hono, a Postgres-free mode, connecting Grids — see
`.agents/plans/portable-next.md`.

## Validation

- `bun test` in `apps/launcher` — 3 pass.
- End to end on spare ports against a fresh database: migrations ran, the owner was created
  (`owner.txt`, mode 600), console built; through the gateway `/` 200, `/api/v1/health` 200,
  `/api/v1/projects` 401, `/runner/health` `{"ok":true}`, and a Codespaces `Host` header 200.
  Stopping the launcher freed all three ports.
- `docker compose -f docker/compose/postgres.yml -f docker/compose/grid.yml config` valid.
- Gate: typecheck, lint, architecture:check.

## Resolution

Landed on `agent/backend/portable-grid`: `apps/launcher`, `apps/nest-api/src/database/owner.ts`,
`.devcontainer/compose.yml`, `docker/grid.Dockerfile`, `docker/compose/grid.yml`,
`/docs/portable`.
