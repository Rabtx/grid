# Plan: where Grid goes next

Status: **proposed** — shared by the human on 2026-09-27; order and first slices below are the
recommendation, to confirm before cards are cut
Owner: human · Coordinator: pm
Created: 2026-09-27

## Where we are

The console is rebuilt on the kit end to end: shell, home, threads (turn by turn, with timing),
the model picker and effort slider, board, files (read-only), notes, terminal, settings, sign-in,
setup and invites. Agents run on the runner of the machine a project lives on (this one, a
Codespace, a VPS) and the console drives them from any device, phones included.

Grid today is **agentic**: one person, many agents, one project at a time. The direction is a
**company OS**: a team and its agents building, shipping and running a startup from one place.
Each phase below moves one step that way and ships on its own.

## Principles for everything below

1. **Web first, phone native.** Every surface works in a browser and on a phone. Where a desktop
   app would reach into the OS (a browser view, the file system), Grid reaches through the runner.
2. **The runner does the work, the API keeps the record.** Git, `gh`, files, browsers and agents
   run on the runner beside the code; schedules, connections, runs and history live in Postgres.
3. **Provider-agnostic.** Connectors and agents are adapters; GitHub is the first connector, not the
   only one.
4. **One card, one PR.** Each numbered item is sized to be split into cards that ship alone.
5. **Lean.** Prefer what Bun, Vite and the kit already give. New dependencies are named below with
   the reason (CodeMirror for editing, a headless Chromium for the browser).

## Phase A — the daily-driver loop (next)

The things every session needs, and the foundation the later phases stand on.

### A1. A git worktree for every thread, by default

- Each new thread gets its own worktree and branch (`grid/<thread-slug>`) under a Grid-owned
  folder beside the project, so agents never trip over each other or over your checkout.
- The composer's tray shows the branch; the thread's menu offers "Open in terminal", "Discard
  worktree", "Keep branch". A setting per project turns it off ("work in the project folder").
- A Worktrees page (Settings → Workspace) lists them with dirty state, unpushed commits and the
  threads using them, and cleans up merged or abandoned ones safely (never deletes unpushed work
  without asking).
- Why first: parallel agents, pull requests, automations and "fix this PR" all need it.

### A2. Attachments

- Paste, drag or pick files and images into the composer (up to ~20, with a size cap); images
  show as thumbnails, files as chips. Sent to the agent as image or resource content blocks.
- Stored with the thread on the runner so a reload or another device still sees them.

### A3. Slash commands

- `/` in the composer opens a searchable list, like `@` does for files:
  - **Grid commands:** `/new`, `/model`, `/effort`, `/mode`, `/stop`, `/compact`, `/note`,
    `/task` (turn the message into a board task), `/review`, `/pr`.
  - **The agent's own commands**, as the agent reports them, and **project skills** (reusable
    prompts kept in the repo).
- Keyboard first on desktop; a sheet on phones.

### A4. Edit code in Files

- The file view gets an editor: **CodeMirror 6** (small, modular, lazy-loaded only when a file is
  opened for editing), with syntax colouring, search, Ctrl/⌘+S to save, a dirty dot, and a diff
  against the last commit.
- Saving goes through a new runner write route with the same folder containment as reading, and
  refuses to overwrite a file that changed on disk since it was opened (the runner compares a
  hash), offering "Reload" or "Overwrite".
- Phones open files to read, with an Edit toggle, since editing code on a phone is occasional.
- Later: "Ask the agent about this selection" from the editor.

### A5. Agents that only have a terminal (starting with Freebuff)

Some agents ship only an interactive CLI, with no protocol to drive. The first attempt (draft
PR #106, closed unmerged because it predates the kit) proved the approach; rebuild it on the
current runner and console:

- **Launch the official CLI in a PTY** (Bun's terminal support) in the thread's folder or
  worktree, reusing the runner's terminal session, auth, reconnect and raw-byte replay. Never use
  the tool's private interfaces.
- **Read its screen, not its bytes:** a headless VT parser (`@xterm/headless`) keeps the screen
  state and turns it into events — the current screen, new text, prompts and menus.
- **Drive its own UI with keys:** list models by opening the CLI's model menu (including its "see
  all" option) in a throwaway folder, pick the chosen one, answer its prompts; if it reopens a
  previous session, leave that the way the tool itself does (its Ctrl+C flow) and start fresh.
- **Map it into Chat:** the agent appears in the model picker like any other, and the parsed
  screen becomes streaming `message` events and a turn end, so the thread reads like every other
  agent's. The chosen model shows after the first message, since the CLI fixes it at start.
- **Keep what the tool shows:** a free tool's sponsored lines stay visible (in the transcript or
  beside it), recorded as they scroll so none is lost.
- **Fall back to the raw terminal** in a tab when the screen cannot be interpreted, with a phone
  key bar for Enter, Ctrl+C, arrows and slash commands.
- **Lessons from the first attempt, as tests from day one:** lines that scroll off within one
  write, identical lines not collapsed, a line split across chunks counted once, and a reconnect
  that restores history instead of replaying it as new events.
- The adapter is generic ("interactive CLI agent"); Freebuff is its first user.

## Phase B — GitHub, and a way to see everything that needs you

### B1. Connectors

- A connector is a workspace-level connection to an outside system, shown under Settings →
  Connectors. **GitHub first**: through the `gh` login on the runner's machine (already used for
  Codespaces), later a GitHub App for teams who want one shared connection.
- The same shape takes Linear, GitLab and Slack later.

### B2. Pull requests

- A Pull requests view per project (and across the workspace): **Mine**, **Review requested**,
  **All open**, with checks, review state and labels.
- A pull request opens to its description, checks, changed files (in the kit's diff view),
  comments and review threads, with actions: merge (merge / squash / rebase), mark ready or draft,
  close, comment.
- **"Fix with an agent"**: a thread in a worktree on the PR's branch, primed with the failing
  checks or the review comments.

### B3. Issues and the board

- Link a board task to a GitHub issue (both ways: open the issue from the task, see the task on the
  issue). "Start a thread from this issue".
- Import issues into a board lane, or let an automation (C2) triage them.

### B4. Inbox

- One feed of what needs you: an agent waiting for input or approval, a turn finished while you
  were away, a review requested, checks failed, a mention. Unread counts in the sidebar, the same
  events as push notifications.
- This is the sidebar's Activity from the design; it is where automations report too.

## Phase C — automations

### C1. The automation model

- An automation is **a prompt, an agent and a trigger**: name, prompt, agent + model + effort +
  mode, project, and where it runs (a fresh worktree per run by default, or a named branch).
- **Triggers:** a schedule (hourly, daily, weekdays, weekly at a time), a GitHub event (pull request
  opened, draft opened, issue opened, checks failed), or by hand. Several triggers per automation.
- **Runs:** each run is a thread, with a status (pending, running, succeeded, failed, skipped), its
  trigger and its result, listed on the automation and reported to the Inbox. Runs missed while a
  machine was off catch up within a grace window, or are skipped.
- The **scheduler lives in the API** (Postgres keeps schedules, events and runs) and dispatches each
  run to the runner of the machine the project lives on, so a laptop that sleeps does not lose the
  schedule.

### C2. Templates

A gallery to start from, grouped (Code review, Security, Triage, Docs, Health), each with a
sensible trigger:

| Template | Trigger |
| --- | --- |
| Review new pull requests | Pull request opened |
| Early feedback on drafts | Draft opened |
| Triage new issues (label, size, link to the board) | Issue opened |
| Fix failing checks | Checks failed |
| Find critical bugs in recent commits | Weekdays 09:00 |
| Security review | Weekly, Monday 10:00 |
| Scan for leaked secrets | Daily |
| Audit dependencies | Weekly |
| Add test coverage for risky code | Weekdays |
| Update docs from recent changes | Weekly |
| Weekly changelog | Friday 16:00 |
| Repo health check | Weekly |
| Team standup summary (what agents and people did) | Weekdays 09:30 |

## Phase D — the workspace: panes and a browser

From the reference video: sessions, a browser and terminals as tabs, side by side.

### D1. Tabs and split panes

- A "+" in the tab bar: **Session** (⌘T), **Browser** (⌘B), **Terminal** (⌘\`). Drag a tab to a side
  to split; drag the divider to resize; the layout is remembered per project.
- Phones keep one pane at a time and swipe between open tabs.

### D2. The browser pane

A web app cannot embed most sites (they refuse iframes), so Grid's browser runs on the runner:

- **Your app's dev server** (the common case): the runner proxies it on the console's origin, so it
  shows in an iframe that Grid can script.
- **Any other site:** a headless Chromium on the runner, streamed to the pane as frames, with
  clicks, scrolling and typing sent back. It works the same on a phone, and the agent can use the
  very browser you are looking at.
- **Element picker:** hover highlights an element with its selector and size; clicking it attaches
  the selector, its HTML and a cropped screenshot to the composer, so "make this button bigger"
  points at the right thing.

## Phase E — the team, and the company OS

### E1. People

- Members and roles (owner, admin, member) with invites (the foundation exists), presence, `@`
  mentions in threads and tasks, assigning tasks to a person or an agent, comments on tasks.

### E2. Project management

- The board grows into planning: priorities, labels, due dates, estimates, cycles, milestones and a
  roadmap view; tasks link to threads, pull requests and issues; agents pick up tasks and report
  back on them.

### E3. The rest of the company

- Toward the mission: **Ship** (deploys and previews per branch), **Operate** (incidents, uptime,
  logs, costs), and shared knowledge (notes growing into docs). Each is its own plan when we get
  there.

## Cross-cutting

- **Reliability of the live instance.** The live site ran from a git worktree, and a worktree
  clean-up took it down (2026-09-27). Serve the live console from the portable bundle (`bun run
  grid`) or a folder outside `grid-worktrees`, under a service that restarts it.
- **Usage and cost** per agent, thread, automation and workspace.
- **Audit and permissions** for what agents may do unattended (automations especially).
- **Notifications** stay one system: Inbox, push and email read the same events.

## Recommended order

1. A1 worktrees → A2 attachments → A3 slash commands → A4 editing (each small, each felt daily).
2. B1–B2 GitHub and pull requests, then B4 Inbox (the place automations report to).
3. C1–C2 automations and templates.
4. D1 panes, then D2 the browser (the largest single piece).
5. E, alongside, as the team grows.

## Open decisions

- GitHub: `gh` on the runner's machine first (no setup, per person), or a GitHub App from the start
  (shared, needs a public callback)? Recommended: `gh` first.
- Browser: dev-server proxy first (cheap, covers most use) and the streamed Chromium second?
  Recommended: yes.
- Worktrees on by default for every project, or opt in? Recommended: on, with a per-project off
  switch.
