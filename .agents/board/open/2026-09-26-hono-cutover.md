---
id: str-hono-cutover
title: Hono cutover: everything on apps/api, delete NestJS
type: feature
from: human
to: backend
priority: high
status: backlog
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-auth-core, str-hono-workspace-data, str-hono-billing, str-hono-sign-in-methods]
branch: none
worktree: none
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
