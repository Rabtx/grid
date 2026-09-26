---
id: str-hono-cutover
title: Hono cutover: everything on apps/api, delete NestJS
type: feature
from: human
to: backend
priority: high
status: done
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-auth-core, str-hono-workspace-data, str-hono-billing, str-hono-sign-in-methods]
branch: agent/backend/hono-cutover
worktree: ../grid-worktrees/agent/backend/hono-cutover
scope:
  - apps/api/**
  - apps/nest-api/**
  - apps/launcher/**
  - apps/console/vite.config.ts
  - .devcontainer/**
  - docker/**
  - apps/docs/content/docs/**
  - package.json
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Remove the forwarding; point the launcher, `bun run dev`, the devcontainer, Docker files and deploy docs at `apps/api`; delete `apps/nest-api` and its packages from the lockfile. Check every real flow in the browser (sign-in, 2FA, passkeys, board, notes, avatar, billing pages) and on a real Codespace.

Also give uploads a home of their own: avatars are still written to `apps/nest-api/uploads`
(`GRID_UPLOADS_DIR`'s default, so old and new avatars both load during the move). Move the
default into Grid's data directory, move existing files, and keep `/uploads/avatars/...` URLs working.

## Why / Context

Done when NestJS is gone and nothing notices. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.

## Outcome

- `apps/nest-api` is deleted, with its Docker image, compose fragment, lint/format overrides and
  the NestJS skill. Its packages left the lockfile (@nestjs/*, express via Nest, bcryptjs,
  otplib, google-auth-library, rxjs, helmet, cookie-parser, multer, supertest, ts-node, postgres…).
- `apps/api` serves everything with no forwarding. Bun loads `apps/api/.env` itself (example in
  `apps/api/.env.example`); `bun run db:migrate` / `db:seed` use it.
- Uploads: the launcher gives the API `GRID_UPLOADS_DIR=<data dir>/uploads` and moves files the
  old API kept in `apps/nest-api/uploads` there once (renaming, or copying when the data dir is
  on another disk), so avatar URLs keep working. Outside the launcher the default is
  `apps/api/uploads` (ignored by git).
- New `apps/api/Dockerfile` (runs migrations, then the sources on Bun; uploads on a `/data`
  volume) used by `docker/compose/api.yml` and `render.yaml`. `docker/grid.Dockerfile` builds the
  API instead of NestJS. CI migrates with `packages/db`.
- Docs, agent roles, ownership and READMEs describe the Hono API. Swagger (`/api/docs`) is gone.
- `NEXT_PUBLIC_NEST_API_URL` keeps its name in `apps/web` (the marketing site being trimmed), so
  existing deployments don't break.

## Validation

- `bun run typecheck`: 8/8 packages exited 0. `bun run lint`: exited 0.
  `bun run architecture:check`: passed.
- Tests: apps/api 45 (the forwarding tests went with forwarding), packages/db 4, launcher 4,
  console 272, runner 104.
- Contract suite against this branch's API with NestJS gone: **61/61**.
- `bun run grid` on spare ports: one API process, no NestJS; an avatar placed in the old folder
  was moved to the data dir and served at its old URL. The first try failed moving across disks
  (EXDEV), which led to the copy fallback.
- `apps/api/Dockerfile` built and ran: migrations, then health 200. `docker/grid.Dockerfile`
  built, with no `apps/nest-api` inside.
