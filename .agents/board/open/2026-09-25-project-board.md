---
id: str-project-board
title: The board belongs to the project, and filing an issue is quick
type: feature
from: human
to: ui-ux
priority: high
status: open
assignee: claude
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: []
branch: agent/ui-ux/project-board
worktree: ../grid-worktrees/agent/ui-ux/project-board
scope:
  - apps/console/src/modules/projects/**
  - apps/console/src/modules/shell/**
  - apps/console/src/modules/chat/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

The board is a view of each project (Threads | Board in the project's title bar, and in its
sidebar menu), not a separate destination. Creating an issue is fast: an inline "Add" at the top
of each lane, a full create sheet with title, description (Markdown with preview), status and
owner, a `c` shortcut, and add-another. A task can start a thread in its project, carrying the
task's title and description.

## Validation

Console tests; Playwright at desktop and phone sizes for create, move, open, and start-thread.

## Resolution
