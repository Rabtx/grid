---
id: grid-sync-environment-threads
title: send threads that run on paired environments to grid's database too
type: feature
from: backend
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-thread-sync
depends_on: [grid-thread-sync]
branch: agent/backend/sync-environment-threads
worktree: none
scope: [apps/runner/src/environments/**, apps/runner/src/sync/**]
allowed_shared: []
created: 2026-10-09
updated: 2026-10-09
---

## What

Threads that run on a paired environment (a VPS, a Codespace) live only in that environment's
`chat.db`; the home runner relays them (`/env/<id>/chat`) without keeping anything. Lose the
environment and its threads are gone.

## Why / Context

`grid-thread-sync` sends the home runner's own threads to Postgres. Environments hold no API key on
purpose (a compromised VPS must not reach the database), so they cannot send their own.

## Proposal or Ask

The home runner pulls each environment's threads with the pairing token it already holds (the same
`/chat` routes the relay uses, or a small `/sync/export?after=` route on the environment) and sends
them through its own `ThreadSync`, tagged with the environment as the machine. Restore then works
for environments too.

Done when a thread run on a paired environment is in Postgres within a minute, and survives the
environment being unpaired and destroyed.

## Scope

**In scope:** environment relay and the runner's sync module. **Out of scope:** the console.

## Validation

- Unit tests with a fake environment; an end-to-end run with two scratch runners paired.

## Resolution

Done by claude.

- Environment side: `environments/sync-export.ts`, read-only `GET /sync/threads` and
  `GET /sync/threads/<id>/events?after=`, answering only a valid pairing token and only that
  workspace's threads (`ChatStore.syncList`, `eventsAfter`).
- Home side: `sync/environment-sync.ts`, every 15 s per environment (`EnvironmentStore.all()`),
  reads only what changed after its kept `seq` and sends it with the home runner's key through the
  shared `postRound`, as machine `env-<environment id>`. A thread missing from an answered list is
  sent as deleted; an environment that does not answer changes nothing.

Validation: export tests (own workspace only, 401 without pairing, 404 for another workspace, 405
for writes); environment sync tests (first round, only new events, unreachable deletes nothing,
deletion); runner suite and typecheck clean. End to end: a scratch home Grid paired over the tailnet
with a separate paired-mode runner; a thread created through the home relay reached the database as
machine "Test VPS"; the environment was killed and its data deleted; the thread was still in the
database and `grid restore` brought it home with its events.

