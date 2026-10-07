---
id: grid-transcript-windowing
title: open long threads fast by not replaying and rendering the whole history
type: perf
from: pm
to: web
priority: normal
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/console/src/modules/chat/**, apps/runner/src/chat/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

Attaching to a thread sends its whole event log (`chat/hub.ts:993`), and the transcript renders every block, which is slow on phones for long threads.

## Proposal or Ask

Send and render the recent part, loading earlier history on scroll. Tests.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

