---
id: str-workspaces-invites-setup
title: Workspaces: invites, first-run setup, closed signup
type: feature
from: human
to: backend
priority: high
status: backlog
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-workspaces-data]
branch: none
worktree: none
scope:
  - packages/db/**
  - apps/api/**
  - apps/launcher/**
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Invites by link or email with a role, accepted by signing up or signing in. First run: the launcher prints a one-time setup link with a code instead of writing `.grid/owner.txt`; the setup endpoint creates the owner account and first workspace. Public signup is closed by default on self-hosted Grid (an instance setting the owner can open); registering needs a valid invite otherwise.

## Why / Context

Second of four workspace cards. The model is in the plan's "Workspaces" section.
