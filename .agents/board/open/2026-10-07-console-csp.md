---
id: grid-console-csp
title: add a content security policy to the console
type: feature
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
scope: [apps/console/index.html, apps/console/vite.config.ts]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The console sets no CSP (`apps/console/index.html`) and inserts HTML in several places (`kit/message.tsx:120`, `kit/pull.tsx:595`), with the access token in memory.

## Proposal or Ask

A CSP that allows what the console needs (self, the runner and API through its own origin, previews framed from their ports) and blocks inline script.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

