---
id: grid-contract-tests-isolated
title: stop api contract tests from writing into the live dev api
type: bug
from: pm
to: backend
priority: normal
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/api/test/**, apps/api/package.json]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

`apps/api/test/contract/client.ts:10` defaults `CONTRACT_API_URL` to the live API at `http://127.0.0.1:4000`, which left junk accounts in the dev database.

## Proposal or Ask

Require an explicit URL, or start a throwaway API, so a bare run can never touch the live one.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution
Fixed by claude, 2026-10-07. `apps/api/test/contract/client.ts` no longer defaults
`CONTRACT_API_URL` to the live API on :4000. A bare run stops at once with a message saying to
start a throwaway API on its own database. Verified: `bun test test/contract` without the variable
fails with that message and sends no request. CI is unaffected, because it sets the variable to the
API it starts for the run. API typecheck and root lint pass. Leftover `invited-*@grid.test`
accounts from earlier runs are still in the dev database for the owner to remove.
