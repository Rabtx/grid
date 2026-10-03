---
id: str-figma-automations
title: Automations match the Figma 20 frames — list, recipe, guardrails, runs and last run
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/figma-automations
worktree: none
scope:
  - apps/runner/src/automations/**
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/worktrees.ts
  - apps/runner/src/main.ts
  - apps/console/src/modules/automations/**
  - apps/console/src/kit/automation.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/app.tsx
created: 2026-10-03
updated: 2026-10-03
---

## What

Figma "20 · Automations": the list (panel on desktop, Active then Paused; on phones All / Active /
Paused, Up next, each one's last five runs and templates), an automation opened as a recipe read
as a sentence with its guardrails, runs and last run — with the backend each needs.

## Scope

**Left for later (agentic, by the human's choice):** the "Describe an automation…" composer that
drafts one from a sentence.

## Resolution

**Runner** — an automation has `options`: the role it runs as, the branch its worktree starts
from, open a pull request and wait for review, and guardrails (time limit, budget, off-limits
paths; validated in `optionsOf`). A run is stopped at its time limit or once its reported cost
passes its budget, fails when it changed an off-limits path, and records its steps (last eight
tool calls), summary (the reply's headline), cost and the pull request it opened (found by its
worktree branch). The prompt carries the off-limits paths and the pull request instruction. The
list carries each job's last 28 runs and the machine it runs on. Three new templates; every
template has a glyph and a one-line description. Columns are added in place for existing
databases.

**Console** — each automation has its own address (`/automations/:id`). Panel rows: glyph, name,
when (Tonight, 12 today, Mon, Paused) and the agent with its trigger. Opened: heading with next run
and who made it; Active switch, Run now and ⋯ (Edit, Delete) in the top bar; the recipe (Every
[day at 02:00] on [machine] in [project] [branch] ask [role · model] to … then [open a pull
request] and [wait for my review]); guardrail cards; the runs table (each opens its thread); the
last run step by step with Needs review and Review (to the pull request); the strip of the last 28
runs with its pass rate. Phones: last run first, Active / edit / Run now in a bottom bar. The
editor gains glyph, role, branch, when it is done and guardrails. Kit: `automation.tsx`.

## Validation

- `bun run lint` 0, `bun run typecheck` 0, `vite build` OK.
- Console vitest 84 files / 536 tests (new: automation look ×4; automations screen ×6 — empty state
  and templates, panel groups, opened recipe/guardrails/last run, Run now, template create with
  options, runner error).
- Runner 338 pass (new: outcome ×4, options ×2, store options and run outcome, recipes ×3 — role
  and branch with pull request recorded, gone role, off-limits failure — and the list's recent runs).
- Chromium against this branch's runner (a copy of the runner database, automations replaced by
  seeded ones with fake runs): desktop panel and opened automation, phone list and opened
  automation, editor with the new sections, and a saved edit (time limit) reflected on the card.
