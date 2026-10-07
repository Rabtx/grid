---
id: grid-runner-access-control
title: stop any instance user from getting a shell or folder access on the runner's machine
type: bug
from: pm
to: backend
priority: high
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/runner/src/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

Terminal routes (`apps/runner/src/server.ts:591-619`) check only that the caller is signed in; there is no permission for terminals. `may()` (`permissions.ts:40-44`) passes every owner, and "owner" is the caller's role in *their own* workspace, which any user can create (`apps/api/src/modules/workspaces/routes.ts:56`). The runner accepts any workspace the user belongs to (`auth.ts`), so nothing ties it to its machine's owner. The same gap lets any member switch branches in any project folder under the projects directory (`folders/routes.ts:176-181`).

## Proposal or Ask

Bind the runner to the workspace(s) it serves (its owner's), refuse other workspaces, and gate shells behind an explicit permission (owner and admin by default). Regression tests: a member of another workspace and a plain member are refused a terminal; the owner is not.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

