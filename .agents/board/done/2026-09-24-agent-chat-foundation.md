---
id: str-agent-chat-foundation
title: Agent chat, phase 1 — chat with coding agents per project, on phone and desktop
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: claude
parent: .agents/plans/agent-chat.md (phase 1)
depends_on: [str-console-terminal]
branch: agent/ui-ux/chat-foundation
worktree: ../grid-worktrees/agent/ui-ux/chat-foundation
scope:
  - apps/runner/src/agents/**
  - apps/runner/src/chat/**
  - apps/runner/src/server.ts
  - apps/runner/src/config.ts
  - apps/runner/src/main.ts
  - apps/runner/src/server.test.ts
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/voice/index.ts
  - apps/console/src/modules/shell/components/project-nav.tsx
  - apps/console/src/modules/shell/components/top-bar.tsx
  - apps/console/src/app.tsx
  - apps/console/src/ui/icons.tsx
  - apps/console/src/styles/global.css
  - apps/console/package.json
  - .agents/plans/agent-chat.md
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

The human's ask: a proper chat system with coding agents (their providers, tool calls, model
selection), pinned to a project, mobile-native and desktop — built the clean way. See
`.agents/plans/agent-chat.md` for the design and later phases.

## Resolution

### Runner

- One event model (`agents/events.ts`) every provider is translated into: message and reasoning
  deltas, tool calls (upserted by id), approvals, plans, usage, turn start/end, model/mode info.
- Adapters: **ACP** (`agents/acp.ts`, JSON-RPC over stdio) — opencode today, any ACP agent via
  `RUNNER_ACP_AGENTS`; **Claude Code** (`agents/claude.ts`, stream-json with approvals as
  `control_request can_use_tool`). Agents found on PATH; models come from the agent (opencode
  reported 426 through ACP `configOptions`).
- `chat/hub.ts`: starts the agent on first message, resumes via the provider's own session id,
  merges streamed text in the log, fans events out to every device, parks idle agents after 15
  min, and closes turns a runner restart interrupted. `chat/store.ts`: SQLite (`bun:sqlite`, built
  in) at `~/.local/share/grid/chat.db`.
- HTTP `/chat/providers`, `/chat/sessions`; WebSocket `/chat` (hello → full log → live;
  prompt / cancel / approve / configure). Tool output has terminal colour codes stripped.
- freebuff has no machine-readable mode (interactive only), so it stays in the Terminal.

### Console

- `/chat` per project (`?project=`), `/chat/new`, `/chat/:id`; lazy chunk (23 KB gzip).
- Transcript: your message as a card, Markdown replies (raw HTML escaped, only http/https/mailto
  links, no remote images), collapsible thinking, tool calls grouped and folded to a summary
  ("Read a file, searched") once done, approval cards with the agent's own options, plans,
  errors/stopped notices, context meter.
- Composer: auto-growing, Enter sends on a physical keyboard (a new line on phones), stop while
  running, agent / model / mode pills (native selects: the phone's picker, fine with hundreds of
  models), its own mic for voice input (the floating mic would sit on Send), folder line.
- Phones: one pane (list, or conversation / new chat), sized to the visual viewport so the
  composer sits above the keyboard; from lg the list stays beside the conversation.

### Validation output

```text
$ bun test               # apps/runner — adapters against scripted fake agents, hub, store
 27 pass
 0 fail
$ bunx vitest run        # apps/console
      Tests  140 passed (140)
$ typecheck (console, runner) · oxlint · bun run lint · architecture:check → clean
$ bun run build          # console
dist/assets/chat-…js     71.98 kB │ gzip: 22.86 kB
```

Real agents through the hub (no UI):

```text
opencode: user turn_start info(models=426,model=opencode/big-pickle) reasoning… msg("pong") usage turn_end   (10.6 s)
claude (haiku): user turn_start info msg("p") msg("ong") usage(costUsd 0.059) turn_end                        (4.7 s)
claude, tool use: tool(List the /tmp directory:running) tool(:completed) msg usage turn_end
```

(Claude did not ask before `ls` because the human's own Claude Code settings allow Bash; the
approval path is covered by the adapter test.)

Browser — Chromium, phone 390×844 with touch and desktop 1280×820, against a scripted runner:

```text
floating mic while typing: 0 | composer mic: 1
url: /chat/c1 | approval shown: true
sent: hello,prompt,approve | code block: 1 | summaries: Thinking / Read a file, searched / … / Ran a command
console errors: none
```

### Known limitations (later phases)

Codex and Antigravity adapters, diffs in tool rows, attachments, slash commands, @-mentions,
follow-up queue, renaming/deleting chats from the list.
