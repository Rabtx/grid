---
id: str-runner-diagnostics
title: Runner diagnostics — record errors and dropped connections, and show them
type: feature
from: human
to: backend
priority: high
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: agent/backend/runner-diagnostics
worktree: ../grid-worktrees/agent/backend/runner-diagnostics
scope:
  - apps/runner/src/diagnostics/**
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
  - apps/runner/src/terminals.ts
  - apps/runner/src/chat/routes.ts
  - apps/console/src/lib/runner-link.ts
  - apps/console/src/lib/runner-health.ts
  - apps/console/src/modules/chat/lib/chat-socket.ts
  - apps/console/src/modules/terminal/lib/terminal-socket.ts
  - apps/console/src/modules/settings/**
  - apps/console/src/app.tsx
created: 2026-09-28
updated: 2026-09-28
---

## What

The app sometimes shows "Reconnecting" and nobody can say why. Make the runner record what goes
wrong — its own errors, and every chat/terminal/link socket that drops, with the reason — and let
the console report its side, then show it all in Settings → Diagnostics.

## Why / Context

The runner prints almost nothing (one start-up line), and "Reconnecting" is decided in the browser
(`modules/chat/lib/chat-socket.ts` → `onConnection("reconnecting")`, `lib/runner-link.ts`,
`terminal-socket.ts`), so a drop leaves no trace anywhere. Tracing it needs a record on both ends
with times that line up. Do not change reconnect behaviour in this card: record it first.

## Proposal or Ask

- **Runner journal** (`apps/runner/src/diagnostics/`): a small SQLite table in the runner's
  database (kept to the last ~5,000 rows or 7 days): time, kind, source, message, details (JSON).
  Record: uncaught errors and unhandled rejections (process-level handlers that log, not exit
  silently); every WebSocket close on the chat, terminal and link sockets with code, reason, how
  long it was open and which session/terminal; failed upgrades and auth refusals; agent processes
  that exit unexpectedly; slow requests (over ~2 s). No message text, tokens or file contents.
- **Console reports:** when a socket closes or the link falls back or reconnects, the console
  posts a small event (`POST /diagnostics/client`: kind, close code, reason, online/visibility
  state, how long it was up, the attempt number), batched and best-effort (never retried in a
  loop, dropped when offline and sent later). Include the app version.
- **API:** `GET /diagnostics?since=&kind=` for the signed-in workspace member.
- **Settings → Diagnostics** (desktop and phone): a list of recent events newest first, filters
  (errors, connections, client), "Copy as text" to paste into a chat, and a count of reconnects
  in the last 24 h. Built from the kit.

Definition of done: disconnect the network for a few seconds while a chat is open; Diagnostics
then shows the socket close on the runner side and the reconnect on the console side, at matching
times, with codes.

## Scope

**In scope:** the listed runner and console files, a new diagnostics module on each side.

**Out of scope:** changing reconnect or backoff behaviour, running Grid as a service, alerts.

## Validation

- Runner tests: journal writes, trimming, redaction (no message text), the close hooks, the
  client endpoint's validation and rate limit.
- Console tests: batching, offline hold, the settings page.
- `bun run lint`, `bun run typecheck`, `bun run architecture:check`, kit guard.

## Resolution
