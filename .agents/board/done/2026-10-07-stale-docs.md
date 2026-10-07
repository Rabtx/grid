---
id: grid-stale-docs
title: bring docs in line with the current stack
type: chore
from: pm
to: pm
priority: low
status: done
assignee: claude
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
Fixed by claude, 2026-10-07.

- **Variable renamed:** the web app's API address is now `NEXT_PUBLIC_API_URL`. The old `NEXT_PUBLIC_NEST_API_URL` is still read as a fallback, in `apps/web/src/lib/api/client.ts` and in `docker/compose/web.yml` (as a nested default).
- **Files updated to the new name:** `apps/web/Dockerfile`, `.env.example`, `env.docker.example`, `docker/README.md`, and `docs/docker.mdx` and `docs/deploy.mdx` (which mention the old name).
- **Other stale text:**
  - `AGENTS.md`: `bun run test` runs `bun test` and Vitest, not `cargo test`; the TypeScript test tooling row is updated too.
  - `.agents/worktrees.md`: the port table lists the console, API and runner, not the "Nest API" or an "AI API" that doesn't exist.
  - The `.dockerignore` comment no longer mentions Nest.
- **Checks:** `docker compose config` resolves the URL to the default, the old name and the new name as expected. Web typecheck passes, web 31/31, and lint passes.
- **Left as is:** CHANGELOG entries and `.agents/plans/api-on-hono.md`, which describe the move away from NestJS as history.
