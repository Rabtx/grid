---
id: str-agent-commands
title: Agent commands — each agent's own slash commands in the composer menu
type: feature
from: human
to: backend
priority: high
status: doing
assignee: backend
reviewer: human
parent: str-slash-commands
depends_on: []
branch: agent/backend/agent-commands
worktree: ../grid-worktrees/agent/backend/agent-commands
pull_request: https://github.com/shabirkhan-dev/grid/pull/138
scope:
  - apps/runner/src/agents/**
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/routes.ts
  - apps/runner/src/chat/chat.test.ts
  - apps/console/src/modules/chat/lib/slash-commands.ts
  - apps/console/src/modules/chat/lib/run-slash-command.ts
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/chat/components/chat-screen.tsx
  - apps/console/src/modules/chat/types/chat.types.ts
  - apps/console/src/modules/chat/lib/transcript.ts
  - apps/console/src/modules/chat/lib/slash-commands.test.ts
  - apps/console/src/modules/chat/lib/transcript.test.ts
  - apps/console/src/modules/chat/lib/chat-socket.test.ts
  - apps/console/src/modules/chat/components/slash-menu.test.tsx
allowed_shared: []

Notes:
  - ports: none needed. This card is proven by unit tests (the runner's own) and a console test
    with a stubbed socket; the agent CLIs are exercised directly, each in its own throwaway
    directory. The live API (4000), runner (4100) and Postgres (5433) were not touched.
  - The four `*.test.ts` files were added to `scope` while implementing: they are where this code is
    tested, and the card's own validation asks for attach, grouping, late arrival and verbatim
    sending. The only change to an existing test is `chat.test.ts`'s `event` callback, whose number
    is now optional. No test file was rewritten.
  - `apps/console/src/modules/chat/components/composer.tsx` is NOT touched: another agent owns it
    (`str-composer-plus`). The menu already accepts a grouped list, so nothing there is needed.
  - Review: human, through PR #138. `apps/runner/src/chat/routes.ts` and `components/chat-screen.tsx`
    needed no functional change (see Resolution) — chat-screen is a comment only.
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

All run from the card worktree at `58f2b0d` + this branch, 2026-09-28.

`bun run format`

```
$ oxfmt --write . && bun run scripts:format && (cd packages/logger/rust && cargo fmt || true)
Finished in 202ms on 681 files using 4 threads.
$ shfmt -i 4 -w scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh || true
```

`bun run lint` — every app exits 0; the warnings left are the ones already on `main`
(`apps/web` a11y/react warnings, `apps/runner` `attachments.test.ts` `import()` type and the
`no-control-regex` in `hub.ts`'s attachment names, `apps/console` `login-form`/`palette`). None in
a file this card adds or changes:

```
@grid/ui lint: Exited with code 0
web lint: ... Exited with code 0
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
```

`bun run typecheck`

```
@grid/logger typecheck: Exited with code 0
launcher typecheck: Exited with code 0
runner typecheck: Exited with code 0
docs typecheck: ✓ Types generated successfully
@grid/db typecheck: Exited with code 0
console typecheck: Exited with code 0
@grid/ui typecheck: Exited with code 0
api typecheck: Exited with code 0
web typecheck: Exited with code 0
```

`bun run architecture:check`

```
$ bash scripts/architecture/check-boundaries.sh
Running architecture boundary checks...
Architecture checks passed.
Running kebab-case naming checks...
[naming] OK (692 path(s) checked)
```

`cd apps/runner && bun test`

```
 263 pass
 0 fail
 965 expect() calls
Ran 263 tests across 35 files. [22.89s]
```

`cd apps/console && bunx vitest run`

```
 Test Files  63 passed (63)
      Tests  416 passed (416)
   Duration  26.55s
```

**Tests for the card's list** — all in the two suites above:

| What the card asks for | Where |
|---|---|
| ACP `available_commands_update`: valid, malformed, duplicates | `chat.test.ts` "reports the commands the agent offers, and nothing for an agent that offers none" |
| The Claude list from a recorded init message | `chat.test.ts` "reports the commands from the initialize response, with their argument hints" (65 real commands, trimmed) |
| An answer that is not a list | `chat.test.ts` "asks for nothing in particular, or an answer that is not a list" |
| Names, lengths, duplicates, 200 cap, untrusted input | `agents/commands.test.ts` |
| Clash rewriting both ways | `hub.ts` `agentPromptText` via `chat.test.ts` "sends an agent command the menu prefixed as the agent typed it" (a prefix mid-message is left alone) + `slash-commands.test.ts` "keeps a name Grid also has the agent's" |
| Attach sends the current list, and the list is not in the log | `chat.test.ts` "keeps the agent's commands out of the log, and sends the list to a device that attaches" |
| Late arrival, and every device told | `chat.test.ts` "tells every device watching when the list changes" + `slash-commands.test.ts` "offers an agent's commands that arrive after the composer opened" |
| Console grouping and verbatim sending | `slash-menu.test.tsx` "lists what a real agent reported" (Grid's group first, the agent's under it, `/claude:clear` and `/claude:model` apart) |
| The wire shape, unnumbered | `chat-socket.test.ts` "passes on an event that carries no journal number, and leaves the cursor alone" |

**Real CLIs** — the runner's own hub driven in-process against the installed agents, in a throwaway
directory, `:memory:` store, the turn cancelled the moment the list arrived (no model run):

```
=== claude === 65 commands
  /compact <optional custom summarization instructions>
  /clear [name]
  /model <model>
  /design [what to design]
  /anthropic-skills:docs  ... /anthropic-skills:xlsx
=== opencode === 36 commands
  /automate /autopilot /canvas /create-hook ... /xlsx
=== codex === NO LIST
```

`claude` 2.1.280 answers a `control_request` `{subtype: "initialize"}` with its commands
(`argumentHint`, `builtin`, `aliases`); opencode 1.18.32 over ACP pushes
`available_commands_update`. Codex 0.156.1, freebuff and Antigravity expose no list, so they
report none — the menu shows Grid's commands only. Two of Claude's names (`clear`, `model`) are
Grid's too: they show as `/claude:clear` and `/claude:model` and reach the agent as `/clear` and
`/model`.

**Screenshots: not done, and why.** A screenshot needs the whole signed-in stack — the console, a
runner, the API and Postgres — and the card's own rule for this card was to keep off the live API,
runner (4100) and database (5433). What the menu shows is instead covered by rendering the real
`SlashMenu` with a real list (`slash-menu.test.tsx` above): the group headings, the two names apart
and the hint beside the description are asserted, not eyeballed. If a reviewer wants pixels, the
check is one `bun run dev` on a private port with a throwaway account.

## Before you open the pull request (self-review)

These were found in the last reviews; check each and say so here.

- [x] Nothing blocks the runner's event loop: no `Bun.spawnSync`, no sync fs on hot paths. The
      list is read over the same async `JsonProcess` the models come from, in its own short-lived
      process, and nothing on the message path touches the disk.
- [x] Everything from an agent is untrusted: `agents/commands.ts` takes `unknown`, requires
      `name` to match `^[\w:.-]{1,64}$` (never shortened, so two names cannot collide), folds
      whitespace flat, caps a description at 200 and a hint at 120, keeps the first of a repeated
      name and stops at 200 entries. The console renders them as text through the existing menu.
- [x] Every failure tells the person why; no silent returns. A CLI that will not answer is asked in
      the background, and both ways of not answering say so on the runner's log
      (`[runner] Claude could not be asked for its commands: …`, `… did not list its commands
      within 30000ms`); a malformed answer is no commands, not a crash, and the menu falls back to
      Grid's own. The person is not shown a group's absence as an error, because it is not one.
- [x] Edge cases tested: empty list (`commands.test.ts`, the hub, the console), a list changing
      mid-thread and two devices both being told (`chat.test.ts`), an agent that never reports one,
      an answer that is not a list, a duplicate name, a 500-command list, a name that cannot be
      typed. A restarted agent: the last list stays until the new agent reports its own, so the
      group does not blink out between turns, and a session whose runner restarted reports `null`
      until it is asked again.
- [x] No Solid 1 APIs; kit-guard clean; no new dependencies. The only new console code is a plain
      mapping function and one memo — no `createResource`, `onMount` or `classList`; no
      `package.json` touched, `bun.lock` unchanged.
- [x] Tested only against your own servers and database copies — never the live API or database.
      The real-CLI run used the hub in-process with `:memory:` and a temp directory. The live API
      (4000), runner (4100) and Postgres (5433) were not touched, and no process was started or
      stopped other than the ones this card started.
- [x] Never kill processes you did not start. The only thing cancelled was a turn in a session the
      evidence script had just created.

## Resolution

The runner learns each agent's real commands and keeps the list beside the live session, never in
the log: Claude Code is asked once per session start over its `initialize` control request (its own
commands, a user's, a plugin's, the project's, with their argument hints), and an ACP agent's
`available_commands_update` is taken as it arrives. The console lists them under the agent's name
after Grid's, sends the chosen one as typed, and shows a name the two share as `/<agent>:<name>`,
which the runner takes off again before the agent sees it. Agents with no list — Codex, Freebuff,
Antigravity — simply add nothing.

`apps/runner/src/chat/routes.ts` is in scope and needed no change: the command list travels as a
chat event over the socket that `src/channels.ts` already forwards, and the HTTP surface here only
lists agents and sessions. `components/composer.tsx` was not touched: the menu already took a
grouped list.

## Resolution

