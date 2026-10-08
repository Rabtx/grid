---
id: grid-thread-sync
title: sync each runner's threads to postgres and restore them on a new machine
type: feature
from: human
to: backend
priority: high
status: doing
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/backend/thread-sync
worktree: ../grid-thread-sync
scope: [packages/db/**, apps/api/src/**, apps/runner/src/**, apps/launcher/src/**, scripts/bash/install.sh, scripts/bash/grid.sh, apps/docs/content/docs/portable.mdx, README.md]
allowed_shared: []
created: 2026-10-09
updated: 2026-10-09
---

## What

Threads (messages, tool calls, diffs, approvals) live only in each runner's SQLite `chat.db`. Lose
or replace the machine and its threads are gone, even when Grid's Postgres is hosted. Sync every
runner thread to Postgres through the API, and let a new machine restore them. Also let the
one-line install take a hosted `GRID_DATABASE_URL`.

## Why / Context

Grid's mission says execution machines are disposable while projects, threads and context persist
(`AGENTS.md`). Today only accounts, workspaces, projects and tasks are in Postgres.

## Proposal or Ask

- `threads` + `thread_events` tables (append-only, `(thread_id, seq)` keyed), with the machine each
  thread lives on.
- API routes under `/api/v1/runner/…`, authenticated by a machine key (`GRID_RUNNER_KEY`) shared by
  the API and its runner only. Runners never hold the database URL.
- Runner syncer: pushes each thread's metadata, events after the last confirmed `seq`, and
  deletions; backfills existing threads; survives the API being down.
- Restore: `grid restore` lists machines with stored threads and imports one machine's threads
  into this runner, which then owns them.
- Launcher generates the machine key; installer accepts `GRID_DATABASE_URL`.

Done when a thread created on machine A is in Postgres, and a fresh machine B on the same
database restores it with its full history visible in the console.

## Scope

**In scope:** the paths in `scope`.

**Out of scope (cards raised):** threads on paired environments, a restore button in Settings,
carrying a restored thread's history into a fresh agent session.

## Validation

- Unit tests: API routes, runner syncer, store import; `bun run typecheck`, `bun run lint`.
- End to end on a scratch Postgres container: two scratch Grids, sync from A, restore on B.
- Installer with `GRID_DATABASE_URL` against the scratch Postgres.

## Resolution

