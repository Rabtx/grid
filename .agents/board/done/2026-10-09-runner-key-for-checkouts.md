---
id: grid-runner-key-for-checkouts
title: let a checkout's bun run start sync threads without hand-set keys
type: chore
from: backend
to: backend
priority: normal
status: done
assignee: claude
reviewer: human
parent: grid-thread-sync
depends_on: [grid-thread-sync]
branch: agent/backend/runner-key-for-checkouts
worktree: none
scope: [apps/api/src/config/**, apps/runner/src/config.ts, apps/docs/content/docs/portable.mdx]
allowed_shared: []
created: 2026-10-09
updated: 2026-10-09
---

## What

The launcher and the one-line install generate `GRID_RUNNER_KEY` and hand it to the API and the
runner. A checkout run with `bun run start` (the always-on `grid-dev.service`) has none unless it is
set by hand in both, so its threads stay on the machine.

## Proposal or Ask

With no `GRID_RUNNER_KEY` in the environment, the API and runner on the same machine read (and the
first one creates, mode 600) a shared key file under `$XDG_DATA_HOME/grid/runner.key`. Done when
`bun run start` from a checkout syncs threads with no extra settings.

## Validation

- Config tests for both; a scratch checkout start on spare ports.

## Resolution

Done by claude. With no `GRID_RUNNER_KEY`, the API (`apps/api/src/main.ts`) and the runner
(`apps/runner/src/main.ts`) use `machineRunnerKey()`: `$XDG_DATA_HOME/grid/runner.key`, mode 600,
made atomically (`wx`) by whichever starts first. Only the entry points use it, so tests never
write to a home folder. A paired environment (`RUNNER_PAIRING=1`) still does not sync.

Validation: key tests in both apps (one key, reread, mode 600); runner and API typecheck; boundary
check clean. End to end: API and runner started separately from a checkout with no key and scratch
data; the API made the key file, the runner read it, and a thread synced (`/runner/machines` listed
it).

