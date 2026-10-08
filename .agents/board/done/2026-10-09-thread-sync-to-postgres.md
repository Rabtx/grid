---
id: grid-thread-sync
title: sync each runner's threads to postgres and restore them on a new machine
type: feature
from: human
to: backend
priority: high
status: done
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

Done by claude on `agent/backend/thread-sync`.

- `packages/db`: `threads` + `thread_events` (migration `0014_threads`).
- `apps/api/src/modules/runner`: `/api/v1/runner/{sync,machines,machines/:id/threads,threads/:id/events,machines/:id/claim}`,
  behind `Authorization: Runner <GRID_RUNNER_KEY>`, off without a key. A thread is written only by
  the machine holding it; the server answers how far its copy is whole, so gaps are refilled.
- `apps/runner/src/sync/thread-sync.ts`: batched rounds every 5 s, deletions via a trigger, a machine
  id kept in `chat.db`; `apps/runner/src/restore.ts` + `ChatStore.importThread`.
- Launcher: `runnerKey` in `secrets.json`, `bun run grid:restore`. Installer: `GRID_DATABASE_URL`;
  `grid restore`.

Validation: API runner routes 6 pass (in-memory PGlite with migrations); runner suite 491 pass;
`bun run typecheck` and `bun run lint` clean; shellcheck clean. End to end on a scratch Postgres
16 container: machine A (one-line install with `GRID_DATABASE_URL`) ran a real Codex thread whose 12
events reached Postgres; A stopped; fresh machine B on the same database, `grid restore` listed A
and restored the thread with its history (seen in B's console); a follow-up on B started a fresh
agent and the new events synced (18 in SQLite, 18 in Postgres).

Follow-ups raised: grid-sync-environment-threads, grid-restore-from-settings,
grid-restored-thread-context, grid-sync-thread-attachments, grid-runner-key-for-checkouts.

