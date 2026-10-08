---
id: grid-sync-environment-threads
title: send threads that run on paired environments to grid's database too
type: feature
from: backend
to: backend
priority: high
status: open
assignee: none
reviewer: human
parent: grid-thread-sync
depends_on: [grid-thread-sync]
branch: none
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

