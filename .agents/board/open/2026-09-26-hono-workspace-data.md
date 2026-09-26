---
id: str-hono-workspace-data
title: Hono: projects, tasks, notes and profiles
type: feature
from: human
to: backend
priority: normal
status: ready
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-foundation]
branch: none
worktree: none
scope:
  - apps/api/src/modules/projects/**
  - apps/api/src/modules/profiles/**
  - apps/api/test/contract/projects*
  - apps/api/test/contract/profiles*
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Port `modules/projects` (projects, tasks with per-project numbering under a row lock, notes) and `modules/profiles` (profile update, avatar upload stored under `uploads/` and served at `/uploads/...`). Same routes, bodies, status codes and validation errors.

## Why / Context

Parallel lane for an agent once the foundation is merged. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.
