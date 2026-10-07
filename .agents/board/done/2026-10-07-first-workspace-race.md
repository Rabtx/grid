---
id: grid-first-workspace-race
title: stop a new user's first load from racing into two workspaces or a 500
type: bug
from: pm
to: backend
priority: medium
status: done
assignee: claude
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
Fixed by claude, 2026-10-07.

- **The fix:** `ensureDefaultWorkspace` (`packages/db/src/workspaces.ts`) finds or makes the user's default workspace in one transaction. It holds `pg_advisory_xact_lock(hashtext('personal-workspace:<user>'))`, so concurrent first loads wait their turn: the first creates the workspace, the rest find it. There's no schema change, and it works on PGlite as well. `access.ts` uses it in place of check-then-create. `createPersonalWorkspace` stays for the seed and contract tests, sharing the insert.
- **Tests:** new PGlite test `workspaces.test.ts`: five simultaneous requests for a new user give one workspace, the same id each time, with the owner role, and a second call finds it.
  - Before removing it from the committed tests, I ran the old check-then-create pattern three at once in the same test. It created more than one workspace, which shows the race was real.
- **Checks:** db 12/12, API 42/42, typecheck and lint pass.
