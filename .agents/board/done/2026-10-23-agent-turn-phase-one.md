---
id: grid-agent-turn-phase-one
title: queue and steer, subagents, agent questions, inline visuals, checkpoints, forks and a feature tour
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: ccr-9c1ba5cb-8vmqkv
worktree: none
scope: [apps/runner/src/agents/**, apps/runner/src/chat/**, apps/runner/src/main.ts, apps/runner/src/server.ts, apps/runner/src/push/notifier.ts, apps/runner/src/inbox/attention.ts, apps/console/src/kit/**, apps/console/src/modules/chat/**, apps/console/src/modules/tour/**, apps/console/src/modules/settings/components/general-screen.tsx, apps/console/src/routes/**, apps/docs/content/docs/backend-api.mdx, CHANGELOG.md]
allowed_shared: []
created: 2026-10-23
updated: 2026-10-23
---

## What

The first phase of the agent-thread features Synara shipped and Grid lacked: a message queue with
steering while an agent runs, provider subagents, agent questions, inline visuals, per-turn
checkpoints with Undo, forking a thread from a turn, and a tour of them.

## Why / Context

Grid's composer refused a message while a turn ran, its event model had no subagents or
questions (Codex questions were declined), and a turn's edits could not be undone. These are the
core thread behaviours Hubs and multi-agent work build on.

## Proposal or Ask

Done when each feature works end to end through the runner's event log and the console, with
tests on both sides, and the API contract documents the new routes, commands and events.

## Scope

**In scope:** the paths above.

**Out of scope:** Hubs, server-side worker monitoring, provider-native forks (forks reconstruct
context from the transcript for every agent), steering ACP agents mid-turn.

## Validation

- `bun test` in `apps/runner` (new `turn-flow`, `visuals`, Claude and Codex adapter tests).
- `vitest run` in `apps/console` (reducer, composer, kit and tour tests; kit guard).
- `bun run lint`, `bun run format`, `bun run typecheck`, `bun run architecture:check`.
- `/design` → Agent turns checked in Chromium at 1280px and 390px.

## Resolution

Landed on `ccr-9c1ba5cb-8vmqkv`. Runner: `agents/{events,provider,claude,codex}.ts`,
`chat/{hub,store,routes,checkpoints,visuals,grid-tools}.ts`. Console: `kit/{visual,agent-work}.tsx`,
chat transcript, composer and conversation, `modules/tour`. Not verified against live Claude Code
or Codex turns from this environment (no model calls were made); Claude's `--replay-user-messages`
flag is confirmed present in the installed CLI.
