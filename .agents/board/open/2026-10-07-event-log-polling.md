---
id: grid-event-log-polling
title: stop the always-on polls from re-reading whole chat histories
type: perf
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
scope: [apps/runner/src/chat/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

`hub.waiting()` (`chat/hub.ts:554-561`, polled every 4 s by every open console, `notifications/stores/attention.ts:9`) and `hub.activity()` (`chat/hub.ts:583-590`, every 5 s per project on Operations, `operations-screen.tsx:158`) call `store.events(id)`, which parses every event row (`chat/store.ts:659-665`). The live database holds 25,657 events; the largest thread has 3,068.

## Proposal or Ask

Answer both from bounded queries (the latest turn only, or state kept per thread), with tests showing the same results.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

