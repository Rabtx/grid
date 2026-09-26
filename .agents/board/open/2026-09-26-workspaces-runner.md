---
id: str-workspaces-runner
title: Workspaces: runner state belongs to the workspace
type: feature
from: human
to: backend
priority: normal
status: backlog
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-workspaces-data]
branch: none
worktree: none
scope:
  - apps/runner/**
  - apps/api/**
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

The runner keys project folders, chats and environments by user today. Key them by workspace, so teammates in one workspace share a project's folder, threads and environments, with access checked through workspace membership.

## Why / Context

Third of four workspace cards. The model is in the plan's "Workspaces" section.
