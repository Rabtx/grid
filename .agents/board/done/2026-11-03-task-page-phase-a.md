---
id: str-task-page-phase-a
title: a task opens as a wide record with its agent work, and agents can be assigned by name
type: feature
from: human
to: web
priority: normal
status: done
assignee: web
reviewer: ui-ux
parent: none
depends_on: []
branch: ccr-d4ce2b6f-zgf6aj
worktree: none
scope:
  - apps/console/src/modules/projects/**
  - apps/console/src/kit/layout.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/modules/chat/lib/agent-choice.ts
  - apps/console/src/modules/chat/components/chat-screen.tsx
allowed_shared:
  - DESIGN.md
created: 2026-11-03
updated: 2026-11-03
---

## What

Phase A of making the board the place work is handed to agents: the task panel becomes a wide
two-column record (title; description and agent work beside a properties card), the assignee is
picked from the agents and roles Grid knows, and "Start with…" opens a chat with the agent picked,
assigning an unowned task to it and moving one not yet started to In progress.

## Why / Context

The human found the task detail too limited: five fields in a 32rem drawer, a free-text assignee,
and no sign of the agents working on a task. Later phases (B–D) link tasks and threads in the data,
add activity, comments, priority, labels, checklists, a review step and dependencies.

## Proposal or Ask

- `kit/layout.tsx`: `DetailColumns` (heading, main, properties aside; aside first on phones).
- `modules/projects/lib/task-work.ts`: threads for a task by key, assignee value mapping, the
  status on start; tested.
- `task-panel.tsx`: the new layout, the assignee picker (Me, agents, roles, someone else), the
  Agent work list, and the footer's agent choice. `chat/lib/agent-choice.ts` shares the key the
  chat reads its next agent from.

## Scope

**In scope:** the paths above. **Out of scope:** schema and API changes (phase B).

## Validation

- `bunx tsc --noEmit` in apps/console: clean; oxlint on the changed files: clean
- `bunx vitest run` in apps/console: 151 files, 818 tests passed
- `bunx playwright test` in apps/console: 14 passed; a temporary spec screenshotted the panel in
  the real app at 1440px and 390px with a thread started from the task, then was removed

## Resolution

Landed on `ccr-d4ce2b6f-zgf6aj`; merged to main by squash.
