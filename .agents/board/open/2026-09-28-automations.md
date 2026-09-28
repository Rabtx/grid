---
id: str-automations
title: Automations — agent jobs that run on a schedule or when something happens
type: feature
from: human
to: backend
priority: high
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: agent/backend/automations
worktree: ../grid-worktrees/automations
scope:
  - apps/runner/src/automations/**
  - apps/runner/src/main.ts
  - apps/runner/src/server.ts
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/inbox/**
  - apps/console/src/modules/automations/**
  - apps/console/src/modules/shell/components/sidebar.tsx
  - apps/console/src/app.tsx
  - apps/console/src/routes/**
allowed_shared:
  - apps/console/src/kit/** (only new primitives the screens need, with a /design entry)
created: 2026-09-28
updated: 2026-09-28
---

## What

An **Automations** page (sidebar top group, beside Inbox) where a person saves an agent job once
and Grid runs it for them. An automation is: a name, a prompt, the agent, model and effort, the
project, where it works (the project folder, or a fresh worktree per run), and one or more
triggers. Each run is an ordinary chat thread in that project, so its transcript, tool calls and
diff are visible like any other thread, and a finished or failed run lands in the Inbox.

## Why / Context

Grid's mission is agents as workers, not a chat box. Recurring work — "review new pull requests",
"find critical bugs every morning", "watch failing checks", "weekly changelog" — should not need a
person to type the same prompt again. The runner already owns threads, worktrees, the GitHub sync
behind the Inbox (`apps/runner/src/inbox/github.ts`) and push notifications, so automations belong
in the runner, per machine, like threads.

## Proposal or Ask

**Runner (`apps/runner/src/automations/`)**

- Store in the runner's existing SQLite (new tables, created if missing — follow
  `inbox/store.ts`): `automations` (id, workspace, owner user id, name, prompt, provider, model,
  effort, mode, project slug, workspace mode `folder | worktree`, enabled, triggers JSON,
  next_run_at, created/updated) and `automation_runs` (id, automation id, trigger `schedule |
  event | manual`, scheduled_for, started/finished, status `running | succeeded | failed |
  skipped`, error, session id).
- Triggers:
  - **Schedule:** hourly (at minute), daily (at time), weekdays (at time), weekly (day + time), in
    the person's time zone (sent by the console, stored with the automation). Compute
    `next_run_at` in a pure function with tests across DST changes.
  - **GitHub events** (only when GitHub is connected, reusing the Inbox sync, never a second
    poller): pull request opened, review requested from me, check failed on my pull request. A run
    per new item, de-duplicated by item id so a re-sync never runs twice.
- Scheduler: one Bun timer that wakes at the earliest `next_run_at` (re-armed on change, capped at
  a few minutes so clock jumps self-correct), `unref`'d, stopped with the server. No cron package.
  A run missed while the runner was off runs once on start if it's within a 30-minute grace,
  otherwise it's recorded as `skipped`. Never two runs of one automation at once (skip and record).
  Global cap on concurrent automation runs (e.g. 2) so a burst can't starve the machine.
- A run creates a thread through `ChatHub` (same code path as the console, worktree via the
  existing worktree helpers when `workspace mode = worktree`), sends the prompt, waits for the turn
  outcome, and records it. Approvals the agent asks for surface in the Inbox like any thread.
- Routes under `/automations` behind `whoFrom`, scoped to the workspace; owner-only edit/delete:
  list, get, create, update, delete, toggle, `POST /automations/<id>/run` (run now), and
  `GET /automations/<id>/runs` (latest 50). Validate every field server side (lengths, known
  provider/model, project linked in this workspace, trigger shapes). Wrong methods → 405.
- Templates (a static list in the runner, served by `GET /automations/templates`): find critical
  bugs, review pull requests, watch failing checks, add test coverage, audit dependencies, weekly
  changelog. Each is a prefilled form, never auto-created.

**Console (`apps/console/src/modules/automations/`)**

- Sidebar entry "Automations" in the top group. The list shows name, project, next run ("in 3 h",
  "Mondays 09:00"), last run status, and an enable switch; empty state offers the templates.
- Create/edit in a sheet (full-screen on phones): name, prompt (the composer's text field), agent /
  model / effort pickers reused from chat, project, folder or worktree, trigger editor. Save,
  delete (confirm), run now.
- Detail shows the run history; each run links to its thread.
- Built only from kit primitives; mobile first; row actions on hover on desktop and long press on
  touch; every state (loading, empty, error, saving, disabled) designed.

**Definition of done:** an automation made from a template runs on schedule and on "Run now", its
thread opens from the history, a failed run shows in the Inbox, restarting the runner neither loses
nor double-runs anything, and another workspace can't see or run it.

## Scope

**In scope:** the paths above.

**Out of scope:** triggers from Linear/Jira/GitLab, board-task triggers (follow-up card), running
automations on a paired environment other than the one that owns the project.

## Validation

- `bun run format`, `bun run lint`, `bun run typecheck`, `bun run architecture:check`,
  `cd apps/runner && bun test`, `cd apps/console && bunx vitest run` — paste the real output here.
- Tests: next-run computation (every schedule kind, DST, time zones), missed-run grace, no
  overlap, concurrency cap, GitHub de-dup, workspace isolation, owner-only edits, validation
  errors, run-now, restart recovery, console list/sheet/empty/error states.
- Screenshots at 375 px and 1280 px, light and dark.

## Before you open the pull request (self-review)

These were found in the last reviews; check each and say so here.

- [ ] Nothing blocks the runner's event loop: no `Bun.spawnSync`, no sync network, no sync fs on
      hot paths; every network call has a timeout.
- [ ] Everything is bounded: list sizes, request bodies, history length, timers, concurrent runs.
- [ ] Data is scoped: another workspace, or another person where it's personal, can't read it.
- [ ] Console requests guard against stale responses (a request id or version check).
- [ ] Every failure tells the person why; no silent returns.
- [ ] Edge cases tested: empty input, repeats, restart, running twice at once, a person without
      GitHub connected.
- [ ] No Solid 1 APIs; kit-guard clean; no new dependencies unless Bun or the stack can't do it.
- [ ] Tested only against your own servers and database copies — never the live API or database.
- [ ] Never kill processes you did not start.

## Resolution

