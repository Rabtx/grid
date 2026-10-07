---
id: grid-console-initial-bundle
title: cut what the console loads before its first screen
type: perf
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
scope: [apps/console/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The first load preloads about 690 KB of JS: an `appearance` chunk of 337 KB, a projects chunk of 221 KB, and `marked` (see the built `index.html` modulepreload list).

## Proposal or Ask

Find what pulls these into the entry and split them, then measure before and after.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

