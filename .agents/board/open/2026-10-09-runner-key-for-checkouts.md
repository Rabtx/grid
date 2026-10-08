---
id: grid-runner-key-for-checkouts
title: let a checkout's bun run start sync threads without hand-set keys
type: chore
from: backend
to: backend
priority: normal
status: open
assignee: none
reviewer: human
parent: grid-thread-sync
depends_on: [grid-thread-sync]
branch: none
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

