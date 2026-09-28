---
id: str-automations-polish
title: "Automations: rebuild the screen on the kit, and fix three GitHub trigger behaviours"
type: feature
from: human
to: ui-ux
priority: high
status: doing
assignee: claude
reviewer: human
parent: none
depends_on: [str-automations]
branch: agent/ui-ux/automations-polish
worktree: ../grid-worktrees/agent/ui-ux/automations-polish
scope:
  - apps/console/src/modules/automations/**
  - apps/console/src/kit/text.tsx
  - apps/runner/src/automations/**
  - apps/runner/src/github/pulls.ts
  - apps/runner/src/github/*.test.ts
  - apps/runner/src/inbox/github*.ts
  - apps/runner/src/main.ts
  - .agents/board/**
allowed_shared: []
created: 2026-09-28
updated: 2026-09-28
---

## What

The Automations screen that shipped in #142 did not match the rest of the console: a wall of
dropdowns for the agent, model, effort and mode, a template opening as "Edit automation", no agent
chosen by default, plain template tiles, and a switch hanging outside every row. Three GitHub
trigger behaviours were also wrong.

## Why / Context

The human asked for the screen to meet the console's standards (`DESIGN.md`, the kit, mobile
first) and for the three behaviours found reviewing #142 to be fixed:

1. A "pull request opened" job fired for every pull request already open when it was saved.
2. An event a busy job could not take was recorded as skipped and never offered again.
3. "Checks failed" ran once per pull request, so failing again after a new push did nothing.

## Proposal or Ask

- **List.** `PaneHeader` + `Page` like Inbox: one `ListCard` of rows with a clock or pull-request
  icon, the project and triggers in words, and on the right when it runs next, "Paused", a
  running dot, or a red dot when the last run failed. Row actions sit behind ⋯ on hover and a long
  press on touch. Templates are a `ListCard` of rows with their trigger and instructions.
- **Detail drawer.** Status card with the on/off switch and the next run, the instructions, a
  setup list (runs, agent · model · effort, where it works), recent runs with status icons that
  open their thread. Footer: Delete, Edit, Run now.
- **Editor drawer.** Name and instructions; "When it runs" as a card of trigger rows whose picker
  groups schedules and GitHub events with a hint each; one time-zone picker; the composer's own
  `ModelPicker` and `ModePicker`, defaulting to the first installed agent's own model and effort;
  project and a two-option `RadioCards` for folder or fresh worktree; Active. New vs edit titles,
  primary "Create automation" / "Save changes", disabled until it can be saved.
- **Runner.** Pull request lists now carry `createdAt` and the head commit. A pull request opened
  before the job was last saved or switched on is not new to it; a busy job leaves the event for
  a later refresh instead of burning it; failing checks are keyed by head commit.
- Kit: `Text` gains `lines` to keep a prompt's line breaks, instead of one-off classes.

## Scope

As listed in the frontmatter. `.agents/board/**` also covers bringing the board up to date: every
card whose pull request merged moved to `done/`, stale duplicates in `open/` removed, and the
workspaces card (members and invites, never started) moved back to `open/`.

## Validation

- `bun run lint`, `bun run typecheck`, `bun run format`, `bun run architecture:check`: pass.
- `apps/runner`: `bun test` — 283 pass, 0 fail (new: pull opened before saving is ignored, a busy
  job takes the item on the next refresh, failing checks on a new head run again, the inbox hands
  jobs the opened time and head commit).
- `apps/console`: `bunx vitest run` — 66 files, 439 tests pass (new: trigger wording, template opens
  as a new automation on the first agent and creates it, paused and next-run labels).
- `apps/console`: `bun run build` passes.
- Browser against the live runner: list, empty state, templates, editor on desktop (1280) and
  phone (375); the trigger picker is a grouped bottom sheet on phones.

## Resolution

Open until merged.
