---
id: str-pglite-optional
title: Postgres optional: PGlite when no DATABASE_URL
type: feature
from: human
to: backend
priority: normal
status: backlog
assignee: backend
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
updated: 2026-09-26
---

## What

`@grid/db` opens PGlite under the data directory when `DATABASE_URL` is unset, instead of starting Docker; same schema and migrations. Postgres stays for the 24/7 host.

## Why / Context

A laptop or throwaway Codespace Grid then needs no database server. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.
