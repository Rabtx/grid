---
id: grid-restore-from-settings
title: restore another machine's threads from settings → machines
type: feature
from: backend
to: web
priority: normal
status: open
assignee: none
reviewer: human
parent: grid-thread-sync
depends_on: [grid-thread-sync]
branch: none
worktree: none
scope: [apps/console/src/modules/settings/**, apps/runner/src/machine/**]
allowed_shared: []
created: 2026-10-09
updated: 2026-10-09
---

## What

Restoring threads is only `grid restore` on the command line. Settings → Machines should list the
machines that have threads in Grid's database and restore one with a button.

## Proposal or Ask

A runner route that wraps `apps/runner/src/restore.ts` (list, restore one machine), for owners and
admins only, and a section under Machines built from kit primitives, following the locked Figma
design. Done when an owner restores a machine's threads from the console and sees them listed.

## Scope

**In scope:** the settings screen and a runner route. **Out of scope:** the sync itself.

## Validation

- Console tests and a browser check on a scratch Grid; mobile first.

## Resolution

