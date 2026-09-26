---
id: str-workspaces
title: Workspaces: the company owns the work
type: feature
from: human
to: backend
priority: high
status: backlog
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-cutover]
branch: none
worktree: none
scope:
  - packages/db/**
  - apps/api/**
  - apps/runner/src/**
  - apps/launcher/src/**
  - apps/console/src/**
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Implement the tenancy model in [api-on-hono](../../plans/api-on-hono.md#workspaces-phase-4-as-agreed): workspaces, members and roles, invites, projects and billing owned by a workspace, workspace slug in URLs, runner keys by workspace, the first-install setup link and onboarding, closed signup by default, and the migration giving each existing user a personal workspace. Split into smaller cards when started; the UI follows the redesign.

## Why / Context

Agreed with the human on 2026-09-26. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.
