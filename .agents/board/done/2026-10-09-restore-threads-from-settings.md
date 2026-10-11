---
id: grid-restore-from-settings
title: restore another machine's threads from settings → machines
type: feature
from: backend
to: web
priority: normal
status: done
assignee: claude
reviewer: human
parent: grid-thread-sync
depends_on: [grid-thread-sync]
branch: agent/web/restore-from-settings
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

Done by claude.

- Runner: `restore.ts` split into `storedMachines()` / `restoreMachine()` (the CLI uses them too);
  `GET /machine/stored` and `POST /machine/stored/<id>/restore`, for roles that manage machines
  (403 otherwise, 404 on a runner that keeps no threads in Grid's database). Paired environments
  still answering are left out of the list.
- Console: `StoredThreadsPanel` on Settings → Machines ("Restore threads"), built from kit
  primitives (`SettingsGroup`, `SettingsRow`, `Button`, `ConfirmDialog`), shown only to machine
  managers and only when something can be restored; a confirmation explains what moves.

Validation: runner route tests (permissions, 404, list, restore); console panel tests (lists,
confirms, restores, hidden for others or nothing to restore); console 721 tests, typecheck, lint,
build. Browser on a scratch Grid: desktop and 375 px phone widths, a gone machine listed, restored
from the dialog (bottom sheet on the phone); threads and events landed on this machine and the
database credits it.

