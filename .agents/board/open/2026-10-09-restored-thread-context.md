---
id: grid-restored-thread-context
title: give a fresh agent the history of a restored thread
type: feature
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
scope: [apps/runner/src/chat/**]
allowed_shared: []
created: 2026-10-09
updated: 2026-10-09
---

## What

A restored thread has no provider session on the new machine (`resume_token` is null), so its next
turn starts a fresh agent that does not know what was said before. Verified end to end: the reply
is correct, but the agent has none of the earlier context.

## Proposal or Ask

When a thread with history starts without a resume token, prepend a compact summary of the earlier
turns (the user messages, the agent's final replies, files changed) to the first prompt, within a
size budget. Done when a follow-up on a restored thread can refer to the earlier answer.

## Scope

**In scope:** the hub's prompt assembly. **Out of scope:** provider adapters.

## Validation

- Hub tests with a fake provider that records its first prompt.

## Resolution

