---
id: str-freebuff-interactive-cli
title: Run Freebuff CLI through an interactive Grid PTY
type: feature
from: human
to: backend
priority: high
status: doing
assignee: backend
reviewer: human
parent: none
depends_on: []
branch: agent/backend/freebuff-interactive-cli
worktree: ../grid-worktrees/agent/backend/freebuff-interactive-cli
scope:
  - apps/runner/**
  - apps/console/src/modules/terminal/**
  - bun.lock
allowed_shared:
  - apps/console/src/modules/terminal/**
  - bun.lock
created: 2026-09-27
updated: 2026-09-27
---

## What

Launch the official Freebuff CLI in the active Grid workspace through Bun PTY. Preserve raw terminal input/output and provide interpreted screen and interaction events for a mobile-friendly view.

## Scope

The human requested the cross-role runner and console integration. Reuse the existing terminal WebSocket, authentication, reconnect, and key controls. Do not use Freebuff private interfaces.

## Validation

- Runner and console tests, lint, typecheck, build, architecture check, format.
- PTY integration test with a fixture CLI, reconnect, input, screen parsing, and ad visibility.
- Browser check at phone and desktop sizes.

## Resolution

Pending implementation and independent review.
