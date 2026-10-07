---
id: grid-production-start
title: give grid a production way to run its services instead of dev servers
type: chore
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
scope: [package.json, apps/*/package.json, scripts/**, apps/docs/content/docs/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The always-on service runs `bun run dev` (Vite dev, Solid dev checks, file watching). That produced the blank-page crash and the memory pressure (a hook was killed with exit 137).

## Proposal or Ask

Add a `start` path: built console served statically, API and runner without watch, and docs for the systemd unit.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

