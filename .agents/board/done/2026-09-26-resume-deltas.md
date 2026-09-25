---
id: str-resume-deltas
title: Coming back catches chats and terminals up instead of replaying them
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/backend/resume-deltas
worktree: ../grid-worktrees/agent/backend/resume-deltas
scope:
  - apps/runner/src/channels.ts
  - apps/runner/src/terminals.ts
  - apps/runner/src/terminals.test.ts
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/chat.test.ts
  - apps/runner/src/server.ts
allowed_shared:
  - apps/console/src/modules/chat/lib/chat-socket.ts
  - apps/console/src/modules/chat/lib/chat-socket.test.ts
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/terminal/lib/terminal-socket.ts
  - apps/console/src/modules/terminal/lib/terminal-socket.test.ts
created: 2026-09-26
updated: 2026-09-26
---

## What

Every reattach rebuilt the screen:
- a chat got its whole log again and rebuilt its transcript;
- a terminal was reset and redrawn from up to 512 KB of output.

That was the flash and scroll jump each time the app came back from the background.

## Proposal or Ask

Catch up instead:
- **Terminals** count bytes: the device says how far it got, and gets only the rest.
- **Chats** number their live events: the device sends its cursor and gets only what it
  missed.

Either falls back to the full replay when catching up is not possible, for example after a
runner restart or after too much output.

## Validation

- Runner, `bun test`: 88 passed. New tests cover:
  - terminal catch-up from an offset, including in the middle of a chunk;
  - starting over when the bytes are no longer kept;
  - chat catch-up from a cursor;
  - the full log for an unknown run;
  - numbered live events.
- Console, `bun x vitest run`: 205 passed. New tests cover:
  - hello carries the offset or cursor;
  - no reset when resumed, and a reset when it is not;
  - missed events are passed on.
- `tsc` and oxlint: clean.

## Resolution

**Runner:**
- `Terminal.since(offset)` and `kept()`, and `attach(…, offset)` returns `resumed` and `at`.
- `ChatHub` keeps a per-session journal: `epoch`, numbered events, and up to 20,000 kept.
  `attach(…, cursor)` returns `missed` and `cursor`.
- The new `channels.ts` (`openTerminal` and `openChat`) carries one terminal or chat to a
  device through a sink, ready for a single connection per machine.

**Console:**
- The chat socket keeps its cursor, sends it on reattach, and applies missed events to the
  transcript as it is.
- The terminal socket counts bytes, sends its offset, and only resets the screen when told to.
- An older runner (an environment not yet updated) still gets the full replay.
