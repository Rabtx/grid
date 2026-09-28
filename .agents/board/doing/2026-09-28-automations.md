---
id: str-automations
title: Automations — agent jobs that run on a schedule or when something happens
type: feature
from: human
to: backend
priority: high
status: doing
assignee: backend
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
  - apps/runner/src/chat/worktrees.ts (async worktree creation for automation runs)
  - apps/docs/content/docs/backend-api.mdx (runner route contract and changelog)
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

- [x] Nothing blocks the runner's event loop: no `Bun.spawnSync`, no sync network, no sync fs on
      hot paths; every network call has a timeout.
- [x] Everything is bounded: list sizes, request bodies, history length, timers, concurrent runs.
- [x] Data is scoped: another workspace, or another person where it's personal, can't read it.
- [x] Console requests guard against stale responses (a request id or version check).
- [x] Every failure tells the person why; no silent returns.
- [x] Edge cases tested: empty input, repeats, restart, running twice at once, a person without
      GitHub connected.
- [x] No Solid 1 APIs; kit-guard clean; no new dependencies unless Bun or the stack can't do it.
- [x] Tested only against your own servers and database copies — never the live API or database.
- [x] Never kill processes you did not start.

## Resolution


Changed:
- `apps/runner/src/automations/**`: runner SQLite jobs/runs, schedule computation, scheduler, routes, templates and tests.
- `apps/runner/src/chat/hub.ts`, `apps/runner/src/chat/worktrees.ts`: ordinary chat creation for unattended runs, with async worktree creation and path checks.
- `apps/runner/src/inbox/github.ts`, `apps/runner/src/inbox/github.test.ts`, `apps/runner/src/main.ts`, `apps/runner/src/server.ts`: reuse Inbox GitHub refresh, surface refresh errors, mount authenticated routes and stop the timer.
- `apps/console/src/modules/automations/**`, `apps/console/src/modules/shell/components/sidebar.tsx`, `apps/console/src/app.tsx`: mobile-first list, template form, drawer, history, and navigation.
- `apps/docs/content/docs/backend-api.mdx`: runner route contract and dated changelog.

Contract impact: new `/runner/automations` routes documented in `apps/docs/content/docs/backend-api.mdx`; existing routes unchanged.

Self-review notes:
- Automation creation and its worktree Git calls use async filesystem and `Bun.spawn` with a 30-second timeout. GitHub CLI calls use the existing 60-second timeout. Existing synchronous chat/worktree helpers remain for ordinary interactive chat; the automation path does not use them. The test fixture uses `Bun.spawnSync` only to create a temporary Git repository.
- List limit 200, body 32 KiB, history 50, triggers 1–5, timer wake at most 3 minutes, two concurrent runs. Workspace checks guard reads; owners alone edit, delete or run; GitHub Inbox errors go only to affected owners.
- Console load and history requests use request IDs. Failed runs and GitHub refresh failures appear in Inbox. Invalid forms and runner actions return visible messages. Repeated GitHub items are deduplicated; restart recovery, missed runs, overlap and cap are tested.
- UI uses Solid 2 and kit primitives. The console suite includes the kit guard. No dependencies added.
- Browser checks used only my Vite server on port 3015 with mocked `/api` and `/runner` responses pinned to 4029/4129; no live 4000/4100 traffic. Screenshots: `/tmp/grid-automations-light-375.png`, `/tmp/grid-automations-light-1280.png`, `/tmp/grid-automations-dark-375.png`, `/tmp/grid-automations-dark-1280.png`, plus the phone drawer `/tmp/grid-automations-sheet-dark-375.png`. All five reported zero page errors. No process other than my Vite server was stopped. Runner tests used ephemeral ports and SQLite memory or temporary copies.

Validation (captured output, exit code 0 for each command):

`bun run format`

```text
$ oxfmt --write . && bun run scripts:format && (cd packages/logger/rust && cargo fmt || true)
Finished in 100ms on 693 files using 4 threads.
$ shfmt -i 4 -w scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh || true
```

`bun run lint`

```text
$ bun run --filter '*' lint && bun run scripts:lint
launcher lint: Exited with code 0
@grid/db lint: Exited with code 0
runner lint: src/chat/hub.ts:610:17: warning eslint(no-control-regex): Unexpected control characters help: Avoid matching control characters in regular expressions. If intentional, disable this rule for the expression.
runner lint: src/chat/attachments.test.ts:63:62: warning typescript(consistent-type-imports): `import()` type annotations are forbidden. help: Replace `import()` type annotations with a regular type import. For example, change `type T = import('module').Type` to `import type { Type } from 'module'; type T = Type`.
runner lint: Exited with code 0
docs lint: src/components/ai/search.tsx:145:5: warning jsx-a11y(no-autofocus): The `autoFocus` attribute is found here, which can cause usability issues for sighted and non-sighted users. help: Remove the `autoFocus` attribute.
docs lint: Exited with code 0
@grid/logger lint: Exited with code 0
api lint: Exited with code 0
@grid/ui lint: src/hooks/use-hover-capable.ts:10:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
@grid/ui lint: src/components/input-group.tsx:49:4: warning jsx-a11y(no-noninteractive-element-interactions): Non-interactive elements should not be assigned mouse or keyboard event listeners. help: Move the handler to an interactive element, or use an appropriate interactive role.
@grid/ui lint: src/hooks/use-mobile.ts:14:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
@grid/ui lint: src/components/glass-card.tsx:32:2: warning eslint(no-unused-vars): Parameter 'edgeHighlight' is declared but never used. Unused parameters should start with a '_'. help: Consider removing this parameter.
@grid/ui lint: src/components/carousel.tsx:96:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
console lint: src/modules/auth/components/login-form.tsx:139:6: warning eslint(no-unused-vars): Parameter 'held' is declared but never used. Unused parameters should start with a '_'. help: Consider removing this parameter.
console lint: src/kit/palette.tsx:189:6: warning jsx-a11y(no-noninteractive-element-to-interactive-role): Non-interactive elements should not be assigned interactive roles. help: Remove the interactive role or use an appropriate interactive element instead.
console lint: src/kit/palette.tsx:206:10: warning jsx-a11y(no-noninteractive-element-to-interactive-role): Non-interactive elements should not be assigned interactive roles. help: Remove the interactive role or use an appropriate interactive element instead.
@grid/ui lint: Exited with code 0
console lint: Exited with code 0
web lint: src/modules/auth/components/presentation/two-factor-form.tsx:31:7: warning jsx-a11y(no-autofocus): The `autoFocus` attribute is found here, which can cause usability issues for sighted and non-sighted users. help: Remove the `autoFocus` attribute.
web lint: src/modules/auth/components/verify-email-form.tsx:35:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/modules/auth/components/reset-password-form.tsx:32:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/modules/auth/context/auth-context.tsx:62:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/components/theme/theme-provider.tsx:45:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/components/motion/theme-toggle.tsx:120:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/components/motion/theme-toggle.tsx:183:18: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/modules/auth/components/account-profile.tsx:32:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/lib/utils.test.ts:6:43: warning eslint(no-constant-binary-expression): Unexpected constant truthiness on the left-hand side of a "&&" expression help: This expression always evaluates to the constant on the left-hand side
web lint: Exited with code 0
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
```

`bun run typecheck`

```text
$ bun run --filter '*' typecheck
docs typecheck: [MDX] generated files in 186.44057900000007ms
@grid/logger typecheck: Exited with code 0
launcher typecheck: Exited with code 0
docs typecheck: Generating route types...
@grid/db typecheck: Exited with code 0
@grid/ui typecheck: Exited with code 0
docs typecheck: [MDX] generated files in 277.77072599999974ms
docs typecheck: ✓ Types generated successfully
console typecheck: Exited with code 0
runner typecheck: Exited with code 0
api typecheck: Exited with code 0
docs typecheck: Exited with code 0
web typecheck: Exited with code 0
```

`bun run architecture:check`

```text
$ bash scripts/architecture/check-boundaries.sh
Running architecture boundary checks...
Architecture checks passed.
Running kebab-case naming checks...
[naming] OK (699 path(s) checked)
```

`cd apps/runner && bun test`

```text
bun test v1.4.2 (744846f84)

src/auth.test.ts:
[runner] could not reach the API to verify a token 53 | 		expect(await verify("expired")).toMatchObject({ status: 401 });
54 | 	});
55 |
56 | 	it("rejects when the API is unreachable", async () => {
57 | 		const verify = createTokenVerifier("http://api.test", (async () => {
58 | 			throw new Error("ECONNREFUSED");
                  ^
error: ECONNREFUSED
      at <anonymous> (/home/ghost/Projects/grid-worktrees/automations/apps/runner/src/auth.test.ts:58:14)
      at known (/home/ghost/Projects/grid-worktrees/automations/apps/runner/src/auth.ts:46:5)
      at <anonymous> (/home/ghost/Projects/grid-worktrees/automations/apps/runner/src/auth.ts:69:23)
      at <anonymous> (/home/ghost/Projects/grid-worktrees/automations/apps/runner/src/auth.test.ts:60:16)


src/transcribe.test.ts:
[runner] speech command failed 3

src/agents/catalogs.test.ts:
[runner] Antigravity did not list its models: agy models timed out

src/chat/worktrees.test.ts:
[runner] kept the worktree of a deleted chat: The worktree has 1 changed file not committed

src/github/pulls.test.ts:
[runner] no failed log for run 42: no failed jobs

src/inbox/github.test.ts:
[inbox] broken: This project's folder has no GitHub repository

 265 pass
 0 fail
 985 expect() calls
Ran 265 tests across 40 files. [28.92s]
```

`cd apps/console && bunx vitest run`

```text

 RUN  v5.0.1 /home/ghost/Projects/grid-worktrees/automations/apps/console

(node:920548) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:920573) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:920591) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:920615) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:920764) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:920908) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  64 passed (64)
      Tests  413 passed (413)
   Start at  13:13:17
   Duration  32.76s (tests 45%, transform 24%, environment 19%, import 11%, worker 1%)
```

Review: human reviewer pending on pull request; no independent approval claimed.

Commit: to be recorded after committing.

Follow-up: none identified within this card.
