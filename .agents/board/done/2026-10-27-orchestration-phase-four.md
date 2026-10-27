---
id: grid-orchestration-phase-four
title: reliable orchestration — steering by restart, restart recovery, safe retries, native forks, merge-back, handback, thread tools, child questions
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-workbench-phase-three
depends_on: []
branch: ccr-9c1ba5cb-8vmqkv
worktree: none
scope: [apps/runner/src/**, apps/console/src/**, apps/docs/content/docs/backend-api.mdx, CHANGELOG.md]
allowed_shared: []
created: 2026-10-27
updated: 2026-10-27
---

## What

The owner's picks A–H from the comparison with T3 Code's orchestration V2, made reliable rather
than copied: steering agents that cannot take a message mid-turn (A), durable turns and safe
retries (B), carrying turns on after a restart (C), agent capabilities (D), a budgeted context
handoff (E), native forks and merge-back (F), thread tools for every agent with a permission
ceiling (G), and child questions routed to the agent that started the thread (H).

## Why / Context

Work was lost or repeated at the seams: a restart killed every running turn, a dropped
connection could lose or double a message, a fork or handoff forgot what the agent knew beyond
the transcript, and only a crew coordinator could direct other threads. T3 Code's V2 rewrite
showed the gaps; Grid closes them on its existing event log rather than with a rewrite.

## Proposal or Ask

Done when each works end to end with real agents, with runner and console tests, and the API
contract documents the new fields, route and tools.

## Scope

**In scope:** the paths above. No new tables beyond `command_receipts` and four session columns;
no new dependency. Not done here: an effect outbox for every provider side effect (the turn and
the queue are what is kept), replay tests from recorded transcripts.

## Evidence

- `bun test` in apps/runner: 571 pass, including `orchestration.test.ts` (steer by restart, the
  stop watchdog, request ids, restart recovery and its limits, a lost session told the thread,
  native and portable forks, merge-back, handback) and `thread-tools.test.ts` (start, wait,
  question routing and answering, permission ceiling, depth limit, retries, send/read/stop).
- `vitest run` in apps/console: 764 pass; typecheck clean; lint shows only warnings that predate
  this work.
- Live with real Claude Code on a local API, runner and console: an agent started a thread with
  `thread_start` and `wait` and reported its answer; a fork answered from its own branched session
  (the fork's Claude session file holds the source conversation, and no history brief was sent),
  and its work was brought back into the source; a runner killed with SIGKILL mid-turn carried the
  turn on when it started ("carried on 1 cut-off turns") and the agent finished its list; a child
  thread's AskUserQuestion reached the lead as a [Thread report], the lead answered it with
  `thread_answer`, and the child finished with that answer.
- Found and fixed on the way: Codex and ACP agents that lost a session started afresh untold, and
  Claude Code agents inherited the host Claude Code session id, so every thread shared one session.
