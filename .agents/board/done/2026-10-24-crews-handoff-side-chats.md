---
id: grid-crews-handoff-side-chats
title: crews with worker monitoring, provider handoff, side chats, board tools for agents, and a background image
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-agent-turn-phase-one
depends_on: []
branch: ccr-9c1ba5cb-8vmqkv
worktree: none
scope: [apps/runner/src/**, apps/api/src/modules/runner/**, apps/console/src/**, apps/docs/content/docs/backend-api.mdx, CHANGELOG.md]
allowed_shared: []
created: 2026-10-24
updated: 2026-10-24
---

## What

Phase two of the agent-thread work: Synara's Hubs as Grid "Crews" (a coordinator chat with member
threads, a parallel limit and server-side stall monitoring), provider handoff, side chats, agents
creating and moving board tasks, and a background image with interface opacity.

## Why / Context

Crews are Grid's multi-agent layer and depend on phase one's queue, subagents and checkpoints. The
board tools tie agents to the board; handoff and side chats round out a thread; the background is
the owner's ask for a more personal UI.

## Proposal or Ask

Done when each works end to end, with runner, API and console tests, and the API contract documents
the routes and events.

## Scope

**In scope:** the paths above. DeepSeek through opencode was meant to take some cards; `opencode.ai`
is blocked by this environment's network policy, so all of it was done here.

**Out of scope:** a crew Library, worker approvals answered by agents (never), provider-native
handoff sessions.

## Validation

- `bun test` in `apps/runner` and `apps/api` (runner-key board routes), `vitest run` in `apps/console`.
- `bun run lint`, `bun run typecheck`, `bun run format`, `bun run architecture:check`.
- Browser (Chromium, signed in locally on PGlite): the tour, the Crew chip, and the background in
  both modes.

## Resolution

Landed on `ccr-9c1ba5cb-8vmqkv`: runner `chat/{crews,crew-routes,board-tools,hub,routes,store}.ts`,
`agents/grid-titles.ts`; API `modules/runner/{routes,schema}.ts`; console `kit/{agent-work,frame}.tsx`,
chat conversation, chat screen and transcript, `modules/split`, `modules/tour`, `lib/backdrop.ts`,
Appearance. Not run against live agent turns from this environment.
