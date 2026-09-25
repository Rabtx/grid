---
id: str-resilient-connection
title: Coming back to the app keeps a live connection instead of reconnecting every time
type: bug
from: human
to: web
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/web/resilient-connection
worktree: ../grid-worktrees/agent/web/resilient-connection
scope:
  - apps/console/src/lib/app-resume.ts
  - apps/console/src/lib/quiet-reconnects.ts
  - apps/console/src/lib/quiet-reconnects.test.ts
  - apps/console/src/modules/chat/lib/chat-socket.ts
  - apps/console/src/modules/chat/lib/chat-socket.test.ts
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/terminal/lib/terminal-socket.ts
  - apps/console/src/modules/terminal/components/terminal-view.tsx
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Every time the app came back from the background it showed "Connection lost — reconnecting…"
and rebuilt the chat or terminal, even when the connection was fine.

## Why / Context

On return, `reconnectNow` closed any socket that had been quiet for 35 seconds. A backgrounded
page runs no heartbeat, so after any real time away a healthy socket was always thrown away. A
socket the phone had killed underneath, which still reports itself open, was not caught until
the network gave up. The banner showed the moment a reconnect started, and every reattach
jumped the chat to its last message.

## Proposal or Ask

Check the link instead of guessing: on return, send a ping and keep the socket if anything
answers within 2.5 s, otherwise replace it at once. Hold the reconnect banner back for 2 s so a
quick reattach is invisible, and keep the reader's scroll position on reattach.

## Scope

**In scope:** the console's chat and terminal sockets and the components that own them.

**Out of scope:** push notifications while the app is closed (next card); delta replay of chat
history on reattach.

## Validation

- `bun x vitest run chat-socket terminal-socket quiet-reconnects` (console): 19 passed.
- `bun run typecheck`, `bun run lint`, `bun run architecture:check`: pass.

## Resolution

- The heartbeat is now a probe. Every 20 s, and whenever the app resumes (visible again,
  restored from the back-forward cache, unfrozen, or back online), the socket is pinged, and it
  is replaced only if nothing comes back within 2.5 s.
- A socket caught halfway through attaching is started over.
- `onAppResume` (`src/lib/app-resume.ts`) is the single resume hook for chats and terminals.
- `quietReconnects` holds back "reconnecting" for 2 s.
- A chat keeps your scroll position when it reattaches.
