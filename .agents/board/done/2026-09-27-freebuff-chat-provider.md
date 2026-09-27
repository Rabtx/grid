---
id: str-freebuff-chat-provider
title: Freebuff as a chat agent, driven through its terminal UI
type: feature
from: human
to: backend
priority: high
status: done
assignee: backend
reviewer: human
parent: none
depends_on: []
branch: agent/backend/freebuff-chat-provider
worktree: ../grid-worktrees/agent/backend/freebuff-chat-provider
scope:
  - apps/runner/**
  - apps/console/src/modules/chat/**
  - bun.lock
allowed_shared:
  - bun.lock
created: 2026-09-27
updated: 2026-09-27
---

## What

Roadmap A5, rebuilt on the current runner (draft #106 was closed unmerged). Freebuff appears in
the Chat model picker like any agent, not in a terminal tab. The runner runs the official CLI in a
pseudo-terminal, picks the model with keys in its own menu, types the message, streams the reply
read off a headless screen into the chat, and when the turn ends restates it exactly from the
CLI's own `/export`.

## Acceptance

- [x] Freebuff is listed with the models its menu offers (all of them, "See all" opened), with
      effort levels for models that have reasoning.
- [x] A message streams into the transcript as it is written, reasoning and text apart.
- [x] A reply longer than the screen streams whole: rows that scroll off are merged, identical
      rows kept, a half-drawn row counted once.
- [x] The finished turn is replaced by the exact Markdown from `/export` (`turn_rewrite` event);
      the export file is removed.
- [x] Stop sends Esc; switching model ends the session (`/end-session`) and picks again.
- [x] The tool's own wallet and perk lines are kept, as a "Freebuff session" step.
- [x] Closing kills the process without ending the paid session hour, so the next start rejoins it.

## Validation

- `bun test` (runner): 134 pass, 0 fail — includes 21 Freebuff tests, 7 of them driving a fake CLI
  in a real PTY.
- `vitest run src/modules/chat` (console): 102 pass.
- `bun run lint`, `bun run typecheck`, `bun run architecture:check`: clean.
- Live, against the real CLI in a scratch folder: model chosen by keys (Solar Mini 4), reply
  streamed then restated with its exact Markdown, a second turn in the same session, no file left.

## Follow-ups

- Tool-call blocks in the export are mapped defensively; check their shape on a real tool turn.
- Freebuff's `ask_user` question UI is not answered from chat yet (Stop still works).
- `--continue` resumes the latest conversation in the folder; exact per-thread resume comes with
  A1 worktrees.
