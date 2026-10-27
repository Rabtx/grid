# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Runner threads sync to Grid's database (with their attachments) and can be restored on a new
  machine from Settings → Machines or `grid restore`; threads on paired environments sync through
  the home runner, and a fresh agent on a restored thread is told the earlier turns.
- The installer asks for an optional hosted database (`GRID_DATABASE_URL`), and a checkout's API
  and runner share a runner key so threads sync without settings.
- Messages sent while an agent works wait in a queue and go when its turn ends; Steer sends one
  into the turn going on (Claude Code and Codex take it mid-turn, other agents are stopped and
  sent it next). A stop or a failed turn holds the queue until Resume.
- Subagents an agent starts (Claude Code's Task, Codex sub-agents) get their own cards with their
  brief, steps and result, and running ones show above the composer.
- Agent questions (Claude Code's AskUserQuestion, Codex's input requests) are answered in a form
  that stays in the transcript, and notify like approvals.
- Inline visuals: agents can show stats, charts, tables, comparisons, checklists, calculators and
  choices in a reply through Grid's `show_visual` tool, or a sandboxed HTML page.
- Every turn that changes files is checkpointed under a hidden git ref, with Undo to put them back.
- Fork a thread from any finished turn (or `/fork`), in the same folder or a new worktree.
- A feature tour of the above, shown once and replayable from Settings → General.
- Crews: start a chat as a crew and its agent coordinates, handing tasks to member threads (a few
  at a time, the rest queued), hearing back as each finishes, fails or stalls. Grid nudges a quiet
  member, restarts it once, then hands it to you with Retry; members' approvals can be answered
  from the coordinator.
- Hand a thread to another agent from the agent picker or `/handoff`, in the same thread or a new
  one; the new agent is told the conversation so far.
- Side chats (`/side`, or the chat button in a thread's top bar) open beside a thread in its
  workspace, with its conversation, and stay out of the thread list.
- Agents can read, add and move tasks on the project's board, acting as you.
- Settings → Appearance → Background: a picture behind the sidebar or the whole app, with interface
  opacity and blur.
- A browser per thread that agents drive with Grid's browser tools (open, read, click, type,
  scroll, screenshot) and people watch and use in the workspace's Browser pane; it opens by itself
  when the agent opens a page.
- Chat tabs: a tab menu (pin, close, close others, close to the right, reopen closed), pinned tabs
  first, drag to reorder, dots for threads waiting on you or finished while away, Alt-key commands,
  and a tab switcher on phones.
- Settings → Keybindings: every keyboard command in one place, each remappable with a key recorder.
- Several accounts per agent (Claude Code, Codex), each signed in on its own and picked per thread,
  and usage rings for each plan's windows at the foot of the sidebar.
- A clearer transcript: each turn's header says how long it took (or that it was stopped or
  failed) and what it did, subagents and background commands sit in compact rows, and steps a stop
  cut short read Interrupted.
- A third edition of the feature tour for the above.
- Agents work with other threads through Grid's thread tools: start one (on any agent) and wait
  for it or hear back when it finishes, send it messages, read it, stop it, and answer its
  questions. A thread acts as its person and never hands out broader permissions than its own.
- A question asked in a thread another agent started goes to that agent (and a crew member's to
  its coordinator), which answers it or asks you.
- After a restart (a crash, an update) the runner carries on every turn it cut off, resuming each
  agent's own conversation; turns that were waiting on you wait for you instead.
- Steering an agent that cannot take a message mid-turn stops its turn and carries on with the
  message, saying so; a stop that does not take effect in 30 seconds ends the agent's process.
- Messages carry a request id, so one sent again after a dropped connection is not sent twice;
  the console sends recent messages again when it reconnects.
- Forks keep the agent's own memory when Claude Code or Codex can branch their conversation, and a
  fork's work can be brought back into the thread it came from.
- Handing a thread back to an agent it was with resumes that agent's conversation and tells it
  only what it missed; an agent told a thread gets the first request and the newest turns with
  their commands and outcomes, and can read the rest with `thread_read`.
- A thread a usage limit stopped carries on by itself once the limit resets, unless you carry on
  or cancel first.
- Agents can watch a pull request: they are woken when a check fails, every check passes, someone
  reviews or comments, or the branch conflicts, until it merges or closes.
- `/goal <what done means>` keeps the agent working turn after turn until it says the goal is met
  (and how it checked) or blocked; the goal shows above the composer with Pause, Resume and Clear.
- Projects can compact idle Claude Code threads with large conversations just before their prompt
  cache expires (project menu → Compact idle Claude Code threads).
- Automations can run on a webhook: each gets an address and secret, deliveries are signed (or
  carry the secret), run once, can be filtered on a field, and reach the agent as data.
- Agent keys (Settings → Agent keys) let agents outside Grid, such as Claude Desktop or Cursor,
  use Grid over MCP: list projects and threads, read them, and with a key that allows it start,
  steer and answer threads, marked as theirs.
- Share a thread with a guest for a day (thread menu → Share with a guest): they follow it without
  signing in and can ask something, which waits for you to send on to the agent or dismiss.
- Snooze a thread for an hour, until tomorrow or next week; it stays quiet until then unless it
  needs you.
- Thread links: agents name threads as links, and clicking one opens that thread.
- Search finds words by their beginning and without accents, best match first.
- Replay tests: real Claude Code sessions are recorded and played back to Grid's Claude Code
  support in the runner's tests.

### Fixed

- Agents saw none of Grid's own tools (visuals, board, crews): the runner asked for a sign-in on
  the tool list.
- An agent that no longer had a session it was asked to resume (Codex, ACP agents) started afresh
  without being told the thread.
- Claude Code agents started by a runner that itself runs inside Claude Code all took that
  session's id, so threads resumed one another's conversation.
- Approvals stay in the inbox while their thread is open, and are settled once answered.
- The landing page shows the real install URL instead of localhost.

### Changed

- The repository moved to [Rabtx/grid](https://github.com/Rabtx/grid); links, the installer
  default and the site point there.

## [0.2.0-beta] - 2026-10-09

First public beta: Grid as a browser-first control plane where agents do the work on any machine.

### Added

- One-line install for Grid or a runner only (`curl … | bash`), the `grid` command, systemd user
  services, and a new landing page at grid.rabtx.dev.
- One command (`apps/launcher`) runs the whole of Grid on a laptop, VPS or codespace, built for
  always-on use without dev servers; Grid can update and restart itself from Settings.
- Workspaces that own projects and billing, with members, invites, roles and custom roles enforced
  for agents, approvals, merges and machines.
- Threads with coding agents (ACP agents, Codex, Claude Code, Freebuff and more): a composer with
  models, effort, modes, slash commands, @ file mentions and attachments; edits as diffs; a git
  worktree per thread when chosen; push notifications when an agent finishes or needs approval.
- An inbox for everything waiting on you, a Home with what needs you and what runs next, a board
  whose tasks an agent can run, notes, a file editor with blame and agent changes, terminals,
  pull requests with reviews, automations on a schedule or GitHub trigger, search and Ask Grid.
- Environments: run a project on the machine its folder is on, pair a codespace or another Grid
  over the tailnet, and install and sign in agents on any machine from Grid.
- Connectors to official MCP servers with OAuth, a vault and a rule-keeping proxy for agents;
  Pulse for shipping, metrics and runway; Ship with environments, promote, roll back and previews;
  Operate with logs, costs, health incidents and alerts.
- Sign-in with passkeys, a second factor, Google or an emailed link; a console PWA that opens
  offline and keeps chats and lists on the device.

### Changed

- The API moved from NestJS to Hono on Bun (`apps/api`), with the schema and migrations in
  `packages/db` (Drizzle). Swagger at `/api/docs` is no longer served.
- The console was rebuilt on Solid 2 with its own design-system kit, following the Figma design.
- Documentation lives only in `apps/docs` (Fumadocs).

### Removed

- The NestJS API, the root `docs/` folder and the web API backend switcher.

## [0.1.0] - 2026-02-10

### Added

- Initial monorepo layout (Turborepo + Bun), before the rename to Grid.
- Dual license: MIT and Apache-2.0.

[Unreleased]: https://github.com/Rabtx/grid/compare/v0.2.0-beta...HEAD
[0.2.0-beta]: https://github.com/Rabtx/grid/releases/tag/v0.2.0-beta
[0.1.0]: https://github.com/Rabtx/grid/releases/tag/v0.1.0
