---
id: grid-production-start
title: give grid a production way to run its services instead of dev servers
type: chore
from: pm
to: backend
priority: normal
status: done
assignee: claude
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
Fixed by claude, 2026-10-07. `bun run start` is now the always-on path:
- web on :3000, console on :3001 and docs on :3002, all from their builds; the console is the built bundle served by `vite preview`, with `/api` and `/runner` forwarded;
- the API and runner run without watching files.

Each app's port is fixed (`--strictPort` on the console), and one app failing no longer stops the others. The launcher's script is renamed from `start` to `grid` (root `bun run grid` is unchanged), so `start` no longer launches a second, launcher-run stack. The systemd user unit, the deploy steps and linger are documented in `/docs/portable#always-on-on-your-own-machine`.

Checked on spare ports: the built console on :3031 serves without the Vite dev client, and `/api` and `/runner` forward (401 without a token). Lint and format pass.

**The owner still has to switch it over:** `grid-dev.service` still runs `bun run dev`. Change its `ExecStart` to `bun run start` (after `bun run build`) to get off the dev servers. I left that unit unchanged.
