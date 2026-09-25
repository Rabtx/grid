---
id: str-runner-link
title: One connection per machine for every open chat and terminal
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: [str-resume-deltas]
branch: agent/backend/runner-link
worktree: ../grid-worktrees/agent/backend/runner-link
scope:
  - apps/runner/src/link.ts
  - apps/runner/src/link.test.ts
  - apps/runner/src/server.ts
  - apps/runner/src/environments/relay.ts
  - apps/runner/src/environments/environments.test.ts
allowed_shared:
  - apps/console/src/lib/runner-link.ts
  - apps/console/src/lib/runner-link.test.ts
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/terminal/components/terminal-view.tsx
created: 2026-09-26
updated: 2026-09-26
---

## What

Every open chat and terminal had its own WebSocket, so coming back from the background
reconnected each one separately.

## Proposal or Ask

- The runner gets `/link`: one connection per device carrying every chat and terminal on
  numbered channels.
- The console's `RunnerLink` shares it per machine, behind a socket-shaped `LinkedSocket`, so
  the chat and terminal socket code (reconnects, catch-up, sign-in renewal) is unchanged.
- One ping checks liveness for all of them.
- A machine without `/link` falls back to one socket each.

## Validation

- Runner, `bun test`: 93 passed. Real-server tests cover:
  - two terminals on one link;
  - catch-up on a new link;
  - 4404 for a missing chat;
  - 4401 for a bad sign-in;
  - 426 for a plain request;
  - a link carried through the environment relay.
- Console, `bun x vitest run`: 210 passed, including 5 for `RunnerLink`: channels, a single
  ping, a dead connection dropped, a refused sign-in passed on, and the fallback.
- End to end, with the real console code against a real runner with real shells:
  - two terminals shared one connection;
  - after the connection was cut, one new connection brought both back with no screen reset
    and nothing replayed.
- `tsc`, oxlint and `bun run architecture:check`: pass.

## Resolution

**Runner:** `link.ts` (`linkMessage` and `closeLink`), on the shared `channels.ts` from the
resume work. `/link` is in the server and the environment relay.

**Console:**
- `lib/runner-link.ts` (`RunnerLink`, `LinkedSocket` and `linkFor(scope)`).
- Conversations and terminal views create their sockets through `linkFor(scope)`.
