---
id: grid-restored-thread-context
title: give a fresh agent the history of a restored thread
type: feature
from: backend
to: backend
priority: normal
status: done
assignee: claude
reviewer: human
parent: grid-thread-sync
depends_on: [grid-thread-sync]
branch: agent/backend/restored-thread-context
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

Done by claude. `apps/runner/src/chat/history-brief.ts` turns a thread's earlier events into a
compact brief (each turn's message, the agent's reply, the files it changed; 12 000 characters,
newest kept when it runs out). The hub (`prompt`) prepends it once, to the first message an agent
gets when it opens with no session to resume on a thread that already has answered turns: a
restored thread, or one whose session was cleared. An agent that resumes its own session, a first
message and a slash command get none.

Validation: brief tests (order, files, budget, empty); hub tests with a recording agent (a restored
thread's first prompt carries the history and the second does not; a resumed session and a new
thread get none); runner suite 496 pass; lint clean.

