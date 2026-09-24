---
id: str-project-board
title: The board belongs to the project, and filing an issue is quick
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: []
branch: agent/ui-ux/project-board
worktree: ../grid-worktrees/agent/ui-ux/project-board
scope:
  - apps/console/src/modules/projects/**
  - apps/console/src/modules/shell/**
  - apps/console/src/modules/chat/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

The board is a view of each project (Threads | Board in the project's title bar, and in its
sidebar menu), not a separate destination. Creating an issue is fast: an inline "Add" at the top
of each lane, a full create sheet with title, description (Markdown with preview), status and
owner, a `c` shortcut, and add-another. A task can start a thread in its project, carrying the
task's title and description.

## Validation

Console tests; Playwright at desktop and phone sizes for create, move, open, and start-thread.

## Resolution

- The board is a view of its project: a Threads | Board switch in the title bar (icons on
  phones) wherever a project is open, and a Board row as the first child of each open project in
  the sidebar tree. The global Board and Chat rows left the sidebar (the tree holds both).
- Filing an issue: the New task sheet now has title, a Markdown description with Write/Preview,
  status chips, owner (nobody, person or agent, with a name) and "Add another"; Enter or
  Cmd/Ctrl+Enter adds. Each stage has an inline "Add task" at the top (Enter adds and keeps the
  field ready); owner lanes open the sheet with the owner filled in. `c` (and `n`) open it.
- A task's panel has "Start a thread": it opens the project's new-thread composer with
  "Work on KEY: title" and the description, ready to send. Task descriptions edit with the same
  Markdown field (preview renders lazily, so the board bundle stays light).

Validation: console 158 tests (new-task test updated for Add another), typecheck and lint
clean; Playwright at 1440×900 and 390×844: view switch, quick add (stays open), c shortcut,
Markdown preview, status and agent owner saved, Start a thread prefills the composer; no console
errors.
