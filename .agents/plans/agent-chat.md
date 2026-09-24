# Plan: agent chat — talk to coding agents from Grid, on the phone and the desktop

## Goal

Chat with coding agents (Claude Code, Codex, opencode, Antigravity, any ACP agent) against a
project, from the console, with the agent's work visible as it happens: streamed replies,
reasoning, tool calls with their output and diffs, approvals, plans, and token usage. Several
sessions per project, running at once, resumable. Mobile-native and desktop from one layout.

## Principles

1. **The agents run where the code is: in the runner.** Each provider is its own logged-in CLI
   on the machine (no LLM API keys in Grid). The runner spawns it per session, next to the
   terminals it already hosts, and keeps it alive across browser disconnects.
2. **One event model, many protocols.** Providers speak different protocols; each adapter turns
   its protocol into one normalised stream (`apps/runner/src/agents/events.ts`). The console
   only ever sees that stream. Adding a provider is one adapter file.
3. **Discover, don't hard-code.** Which agents exist is found on the machine (binaries on
   PATH); which models and modes they offer comes from the agent (ACP `configOptions`, Claude's
   own list) where it can.
4. **The transcript is the source of truth.** Every event is appended to a per-session log
   (SQLite via `bun:sqlite`, built in — no dependency). Reconnecting replays it; a reload, a
   second device and a runner restart all see the same conversation.
5. **Provider-agnostic UI.** Nothing in the console knows which agent it is talking to beyond
   a name, an icon and the options the agent reported.

## Protocols found on this machine (2026-09-24)

| Agent | Headless protocol | Adapter |
|---|---|---|
| opencode | ACP over stdio (`opencode acp`) — models in `session/new` `configOptions` | `acp` (generic) |
| Claude Code | stream-json over stdio (`--input-format stream-json --output-format stream-json --permission-prompt-tool stdio`); approvals as `control_request` `can_use_tool` | `claude` |
| Antigravity (`agy`) | stream-json print mode (`-p --input-format stream-json --output-format stream-json`), `--model`, `--mode`, `--conversation` to resume; its ACP server is a separate download | `claude`-style stream adapter, verified before enabling |
| Codex | `codex app-server` JSON-RPC (`thread/start`, `turn/start`, `turn/interrupt`, approvals) | `codex` |
| freebuff | interactive TUI only (no machine-readable mode) | none — keep using it in the Terminal |

## Phases (one PR each)

**1. Foundation (this PR).** Runner: event model, session manager + SQLite log, WebSocket
`/chat` (hello → replay → live; prompt / cancel / approve / set model / set mode), HTTP
`/chat/providers`, `/chat/sessions`. Adapters: ACP (opencode, and any ACP command listed in
`RUNNER_ACP_AGENTS`) and Claude stream-json. Console: `/chat` — session list per project,
transcript (Markdown, reasoning, tool rows, approvals, plan), composer with agent + model +
mode pickers, stop, voice input (the composer is a text field, so the mic just works).

**2. More agents.** Codex app-server adapter; Antigravity via its stream-json mode; model lists
from each agent's own catalog.

**3. Richer turns.** Diffs in tool rows, attachments (images, files), slash commands, @-file
mentions, follow-up queue while a turn runs, context meter.

**4. On the board.** Start a session from a task ("Run with agent"), a session per worktree,
run status on the card — joins Phase 4/5 of `console-design-migration.md`.

## Decisions

- Sessions belong to the person who created them and to a project slug; the working directory is
  chosen at creation (defaults to `~/Projects/<slug>` when it exists, else the home directory).
- Default mode asks before every edit or command (approvals in the transcript); "accept edits"
  and "full access" are explicit choices per session.
- Transcripts live on the machine that runs the agents (`~/.local/share/grid/chat.db`), like
  the agents' own session stores.
