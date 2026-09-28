---
id: str-agent-commands
title: Agent commands — each agent's own slash commands in the composer menu
type: feature
from: human
to: backend
priority: high
status: open
assignee: none
reviewer: human
parent: str-slash-commands
depends_on: []
branch: agent/backend/agent-commands
worktree: ../grid-worktrees/agent-commands
scope:
  - apps/runner/src/agents/**
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/routes.ts
  - apps/console/src/modules/chat/lib/slash-commands.ts
  - apps/console/src/modules/chat/lib/run-slash-command.ts
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/chat/components/chat-screen.tsx
  - apps/console/src/modules/chat/types/chat.types.ts
  - apps/console/src/modules/chat/lib/transcript.ts
allowed_shared: []
created: 2026-09-28
updated: 2026-09-28
---

## What

The composer's `/` menu already lists Grid's own commands and has a slot for the agent's
(`extra` in `lib/slash-commands.ts`), but nothing fills it. Make the runner learn which commands
the thread's agent offers and send them to the console, so the menu shows a group named after the
agent (for example "Claude" with `/review`, `/compact`, a project's own commands) under Grid's.
Choosing one sends it to the agent exactly as typed.

## Why / Context

Follow-up from the slash-commands card (`.agents/board/doing/2026-09-28-slash-commands.md`), which
shipped Grid commands only because the runner didn't report the agent's. Each agent CLI has its
own commands, and people expect them in the same menu.

## Proposal or Ask

**Runner**

- Add a `commands` chat event: `{ type: "commands", commands: { name, description, hint? }[] }`
  (names without the slash, deduplicated, at most 200, names matching `^[\w:.-]{1,64}$`,
  descriptions trimmed to 200 chars). The hub keeps the latest list per live session, includes it
  in the state a device gets on attach, and sends updates when it changes. Not stored as history.
- Where each agent's list comes from — check each CLI's real behaviour and its docs before
  coding:
  - **ACP agents** (`agents/acp.ts`: opencode and any extra ACP agent): the
    `available_commands_update` session update. Today `acp.ts` handles `session/update` but
    ignores it.
  - **Claude** (`agents/claude.ts`): the command list the CLI reports at session start (the
    `system`/`init` message's slash commands), plus a project's and the user's command files if the
    CLI doesn't already include them. Read it; don't hard-code.
  - **Codex** (`agents/codex.ts`): its custom prompts, if the installed version exposes them;
    otherwise report none.
  - **Freebuff / Antigravity**: only if they expose a list; otherwise none. Never invent commands.
  - All file reads are async and bounded; nothing blocks the event loop.
- When an agent command has the same name as a Grid command, Grid's wins in the menu, and the
  agent's is listed as `/<agent>:<name>`. The runner rewrites that back to `/<name>` before sending.

**Console**

- `conversation.tsx` and `chat-screen.tsx` pass the session's agent commands as `extra`, grouped
  under the agent's display name. A thread whose agent hasn't started yet shows Grid's commands
  only, and the agent's group appears once the list arrives, without flicker.
- Selecting an agent command inserts `/<name> ` (with its hint as placeholder text when it takes
  an argument); Enter sends it to the agent verbatim through the normal send path, with the
  running/queued rules already in the composer.
- Filtering, keyboard, touch and listbox semantics come from the existing menu; don't fork it.

**Definition of done:** in a thread with Claude, opencode and Codex (where each supports it), `/`
shows that agent's real commands under its name; picking one runs it in the agent; a name clash
shows as `/<agent>:<name>` and still reaches the agent as `/<name>`; agents with no list show
Grid's commands only.

## Scope

**In scope:** the paths above.

**Out of scope:** the composer layout and the "+" menu (owned by `str-composer-plus`), Grid's own
command set.

## Validation

- `bun run format`, `bun run lint`, `bun run typecheck`, `bun run architecture:check`,
  `cd apps/runner && bun test`, `cd apps/console && bunx vitest run` — paste the real output here.
- Tests: ACP `available_commands_update` parsing (valid, malformed, oversized, duplicates); the
  Claude list from a recorded init message; clash rewriting both ways; attach sends the current
  list; console grouping, late arrival and verbatim sending.
- A short screen recording or screenshots of the menu for one real agent.

## Before you open the pull request (self-review)

These were found in the last reviews; check each and say so here.

- [ ] Nothing blocks the runner's event loop: no `Bun.spawnSync`, no sync fs on hot paths.
- [ ] Everything from an agent is untrusted: names validated, lengths capped, rendered as text.
- [ ] Every failure tells the person why; no silent returns.
- [ ] Edge cases tested: empty list, list changing mid-thread, agent restart, two devices.
- [ ] No Solid 1 APIs; kit-guard clean; no new dependencies.
- [ ] Tested only against your own servers and database copies — never the live API or database.
- [ ] Never kill processes you did not start.

## Resolution

