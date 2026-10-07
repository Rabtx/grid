---
id: grid-trim-web-app
title: trim apps/web to the landing site it is meant to be
type: chore
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
scope: [apps/web/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

`apps/web` still ships sign-in, sign-up, password reset, magic link, 2FA, admin and board pages (`apps/web/src/app/*`), untouched since 2026-09-22. AGENTS.md says it is to become the landing site only; the console replaced all of this.

## Proposal or Ask

Remove the product pages and their modules, keeping the landing page, and keep its build and e2e passing.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

