---
id: str-runner-restart-recovery
title: Chat and terminals recover by themselves when the runner restarts
type: feature
from: human
to: web
priority: high
status: open
assignee: none
reviewer: claude
parent: .agents/plans/next-foundations.md
depends_on: []
branch: agent/web/runner-restart-recovery
worktree: ../grid-worktrees/agent/web/runner-restart-recovery
scope:
  - apps/console/src/modules/chat/lib/chat-socket.ts
  - apps/console/src/modules/chat/lib/chat-socket.test.ts
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/chat/stores/**
  - apps/console/src/modules/terminal/**
  - apps/console/src/modules/shell/components/status-bar.tsx
  - apps/console/src/lib/runner-client.ts
  - apps/runner/src/server.ts
  - apps/runner/src/server.test.ts
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

When the runner (`apps/runner`, port 4100, proxied at `/runner`) restarts — a deploy, a crash,
`bun run dev` restarting — the console should recover on its own: chat reconnects and carries on,
terminals say clearly what happened and offer to start again in the same folder, and nothing
needs a page reload.

## Why / Context

Both sockets already reconnect with backoff after a network drop (`chat/lib/chat-socket.ts`,
`terminal/lib/terminal-socket.ts`, with tests). A runner *restart* is different:

- Chat: the runner keeps sessions in SQLite (`~/.local/share/grid/chat.db`) and resumes an
  agent from its stored resume token on the next message, so a chat can carry on — but the
  socket may give up, or a turn in flight is lost silently.
- Terminals: PTYs die with the runner process. Reconnecting gets close code 4404 (unknown
  terminal); today that shows as an error.
- HTTP reads (`/runner/chat/providers`, `/runner/chat/sessions`, `/runner/projects/folders`)
  fail during the restart and are not retried, so the sidebar and pickers can stay empty.

## Proposal

1. **Runner health.** Add `GET /runner/health` (no auth, returns `{ ok: true, startedAt }`) in
   `apps/runner/src/server.ts`. In the console, a small health watcher (in `lib/runner-client.ts`
   or a new `lib/runner-health.ts`) polls it while any runner request or socket has failed, with
   backoff (1 s, 2 s, 4 s, then every 5 s), and also on `online` and `visibilitychange`. It
   exposes `runnerUp()` and `runnerRestarted()` (true when `startedAt` changed).
2. **Status bar.** `modules/shell/components/status-bar.tsx` shows a dot and "Runner offline —
   reconnecting…" while it is down, and nothing extra when it is up.
3. **Chat.** `chat-socket.ts` never gives up while the page is open; when the runner comes back
   it reconnects at once (use the health signal), re-sends hello, and the conversation replays
   history from the `ready` message. If a turn was running when the runner went down, show a
   muted notice "The runner restarted; send again to continue" and clear the running state.
   Re-run the failed reads in `chat/stores/providers.ts` and `chat/stores/threads.ts` when the
   runner comes back.
4. **Terminals.** On 4404 after a restart, keep the old scrollback visible, mark the tab
   "ended", and show a bar "The runner restarted and this terminal ended" with **Start again**
   (opens a new terminal in the same `cwd`, replacing the tab) and **Close**.
5. **Tests.** Unit tests for the health backoff, chat socket reconnect after a restart (fake
   socket closing with 1006 then a fresh `ready`), and the terminal 4404 path; a runner test for
   `/health`.

Definition of done: stop the runner with a chat and a terminal open, start it again; within a
few seconds the chat reconnects and accepts a message, the terminal offers Start again and it
works, the status bar returned to normal, and no page reload was needed — on desktop and on a
phone-sized viewport.

## Scope

**In scope:** the paths above.

**Out of scope:** keeping PTYs alive across restarts (needs a detached session host), the chat
transcript design, the shell layout.

## Validation

- `bun --cwd=apps/console run test`, `bun --cwd=apps/runner test`, `bun run typecheck`,
  `bun run lint`, `bun run format`.
- The restart scenario above, run for real, with notes on the card.

## Resolution
