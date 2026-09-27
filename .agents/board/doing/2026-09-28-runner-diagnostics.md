---
id: str-runner-diagnostics
title: Runner diagnostics — record errors and dropped connections, and show them
type: feature
from: human
to: backend
priority: high
status: doing
assignee: codex
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

- `bun run format` — passed.
- `bun run lint` — passed (repository warnings only; no feature warnings).
- `bun run typecheck` — passed.
- `bun run test` — passed: runner 167 tests, console 309 tests, web 31 tests, API 28 passed / 20
  skipped, logger 3 tests, database 4 tests, launcher 4 tests.
- `bun run architecture:check` — passed; 662 paths checked.
- `bun --cwd=apps/runner test src/diagnostics` — passed: 6 tests, 27 assertions.
- `bun --cwd=apps/console run test -- src/modules/settings/services/diagnostics.test.ts
  src/modules/settings/components/diagnostics-screen.test.tsx src/styles/kit-guard.test.ts` —
  passed: 3 files, 5 tests, including the kit guard.
- `git diff --check` — passed.

## Resolution

Added a bounded SQLite diagnostics journal and authenticated workspace endpoints for reading events
and accepting batched client reports. Runner errors, slow requests, refused auth/upgrades, and
chat/terminal/link closes include safe metadata; raw exception text, arbitrary close reasons,
message text, tokens, and file contents are excluded. The console reports closes, fallbacks, and
reconnect attempts best-effort, and Settings → Diagnostics provides filters, a 24-hour reconnect
count, and text export. Reconnect behavior is unchanged.

Commit: `65a96d5` (`feat(runner): add connection diagnostics journal`).

PR: [#133](https://github.com/shabirkhan-dev/grid/pull/133) — open against `main`; human review
pending.
