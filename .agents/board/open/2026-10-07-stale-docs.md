---
id: grid-stale-docs
title: bring docs in line with the current stack
type: chore
from: pm
to: pm
priority: low
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/docs/content/docs/**, AGENTS.md, docker/README.md]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The docs still name the removed NestJS API (`NEXT_PUBLIC_NEST_API_URL` in `docs/docker.mdx:49`, `deploy.mdx:61`, `docker/README.md:27`), and `AGENTS.md:117` says tests run with `cargo test`.

## Proposal or Ask

Correct the docs; renaming the variable is optional and must keep compatibility.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution

