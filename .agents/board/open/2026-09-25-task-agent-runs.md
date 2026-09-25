---
id: str-task-agent-runs
title: Run with agent: launch chat sessions directly from board task cards
type: feature
from: human
to: web
priority: normal
status: backlog
assignee: web
reviewer: human
parent: .agents/plans/agent-chat.md
depends_on: []
branch: none
worktree: none
scope:
  - apps/console/src/modules/projects/**
  - apps/console/src/modules/chat/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Add a "Run with agent" action on board task cards and the task details panel. Clicking it opens a chat
session pre-seeded with the task title, description, and target branch.

## Why / Context

Bridging board tasks directly to agent runs turns the board into an active command center where
tasks are dispatched to agents with a single click.
