---
id: str-figma-board
title: Board matches the Figma 12 Board frames
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-roles]
branch: agent/web/figma-board
worktree: none
scope:
  - apps/console/src/modules/projects/**
  - apps/console/src/kit/**
created: 2026-10-02
updated: 2026-10-02
---

## What

The project board and its task drawer rebuilt to Figma "12 · Board", desktop and phone, light
and dark.

## Scope

**Out of scope (no backend yet, so not drawn rather than faked):** labels, priority, due dates,
comment and check counts, an agent's live plan on a card or in the drawer, linked items and the
activity feed. The seven stages stay: the four columns each hold their stages, and a card names
the finer one (Backlog, Blocked, QA).

## Resolution

**Changed** — four columns (Todo, In progress, In review, Done) with coloured dots, cards with the
owner's mark and key, Done as compact rows newest first with Show more/less, Add task at the foot
of Todo, a + per column. A strip across the top: agents working (from running threads),
approvals waiting (Inbox), ready to review, and done tasks touched in the last 7 days with a bar
per day. The panel: All tasks, Given to agents, Assigned to me, the agents at work now, and the
busiest owners. The top bar holds the filter, By status/By owner and New task; phones get a
search row, "Waiting on you" with Answer, and Todo/Doing/Review/Done tabs. The drawer: key and
stage, copy link, a ⋯ menu (Run with agent, Delete), properties as rows (Status, Assignee with
"Me", Branch), the description, and a message box that starts a thread about the task. Kit:
TaskCard look, BoardColumn bottom slot, LaneDot, CardChip, DoneRow, BoardStats/BoardStat,
MiniBars, QuietInput, PanelFooter; PropertyRow is a row on phones too.

**Validation** — typecheck clean, lint 0 errors, 76 files / 499 tests (columns, tabs, panel views,
owner lanes, moves, the drawer's menu and message box, lane mapping, ownership, per-day counts),
build OK. Chromium at 1440×900 and 390×844, light and dark, against the cloud demo project.

**Review** — independent reviewer: 9 findings and 2 lows, all addressed — Done hid the newest
tasks, "finished this week" relabelled as done tasks touched in the last 7 days and bucketed by
calendar day, the subtitle could suspend the shell, no search on phones and views dropped the
query, no way to pick one owner, "Assigned to me" never matched (the drawer now has "Me"), card
labels missed stage and owner, stale counts across projects, approvals named as such, an empty
message starting a thread, and bars with no numbers for screen readers.
