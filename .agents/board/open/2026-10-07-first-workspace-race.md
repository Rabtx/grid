---
id: grid-first-workspace-race
title: stop a new user's first load from racing into two workspaces or a 500
type: bug
from: pm
to: backend
priority: medium
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [packages/db/src/workspaces.ts, apps/api/src/modules/workspaces/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

`createPersonalWorkspace` (`packages/db/src/workspaces.ts`) checks for an existing personal workspace, then creates one. A new user's first load fires several requests at once, so two can pass the check together. Two workspaces get created, or the second insert hits the slug's unique index and returns a 500.

Found by the "Find critical bugs" thread (2026-10-07), confirmed by reading; not reproduced.

## Proposal or Ask

Make it idempotent. Options: a unique "personal workspace per user" constraint with insert … on conflict do nothing then select; or an advisory lock per user around the check and insert. Retry `freeWorkspaceSlug` on a slug collision. Add a test that runs two creations at once (PGlite) and gets one workspace.

## Validation

- A concurrency test that fails before and passes after.

## Resolution
