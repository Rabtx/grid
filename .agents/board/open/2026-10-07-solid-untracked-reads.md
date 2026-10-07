---
id: grid-solid-untracked-reads
title: fix the reactive reads solid warns will never update
type: bug
from: pm
to: web
priority: low
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/console/src/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The console logs `STRICT_READ_UNTRACKED` warnings by the hundred (174 on one page): reactive values read in effect callbacks, which will not update.

## Proposal or Ask

Find the sources and fix each read, so the console runs with no such warning.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

