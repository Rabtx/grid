---
id: grid-runner-api-outage
title: tell the console the api is unreachable instead of signing people out
type: bug
from: pm
to: backend
priority: normal
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/runner/src/**, apps/console/src/lib/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

When the API cannot be reached, `createTokenVerifier` returns null and the runner answers 401 "Sign in again" (`apps/runner/src/auth.ts:104-106`).

## Proposal or Ask

Answer 503 with a clear message when the API is unreachable, keep 401 for refused tokens, and test both.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

