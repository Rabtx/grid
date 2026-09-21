---
id: str-task-detail-edit
title: Give a task a detail view so it can be edited, reassigned and deleted
type: feature
from: pm
to: web
priority: normal
status: open
assignee: none
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/task-detail-edit
worktree: ../grid-worktrees/agent/web/task-detail-edit
scope:
  - apps/web/src/modules/projects/**
  - apps/web/src/app/admin/board/**
allowed_shared: []
created: 2026-09-22
updated: 2026-09-22
---

## What

The board at `/admin/board` can create a task, show it, and move it between stages. It cannot
open one. Add a detail view where a task's title, description, owner and branch can be edited,
and where it can be deleted.

## Why / Context

The API already supports all of it — `PATCH` and `DELETE` on
`/api/v1/projects/:slug/tasks/:number` accept `title`, `description`, `status`, `ownerKind`,
`ownerName`, `branch` and `position` (see `apps/nest-api/src/modules/projects/projects.dto.ts`).
The web client already wraps them: `projectsService.updateTask` and `deleteTask` in
`apps/web/src/modules/projects/services/projects.service.ts`, with
`useUpdateTaskMutation` in `hooks/use-project-mutations.ts`.

So this is a UI-only card. Nothing in the API or the database needs to change.

## Proposal or Ask

1. Clicking a card on the board opens a detail panel (a sheet or dialog from `@grid/ui` —
   `sheet.tsx` and `dialog.tsx` both exist; do not introduce a new overlay library).
2. The panel shows and edits: title, description, status, owner kind (`human` / `agent`) with
   owner name, and branch. Saving calls the existing update mutation.
3. Deleting asks for confirmation first, then calls `deleteTask` and closes the panel. Add a
   `useDeleteTaskMutation` alongside the existing mutations rather than calling the service
   directly from the component.
4. Keep the existing per-card status select working, or move it into the panel — your call,
   but do not leave two controls that can disagree.
5. Empty, loading, saving and error states must all be handled. A failed save must not silently
   discard what was typed.

**Definition of done:** a task can be opened, edited in every field the API accepts, saved,
and deleted, without a page reload, and the board reflects the change.

## Scope

**In scope:**

- `apps/web/src/modules/projects/**` and `apps/web/src/app/admin/board/**`

**Out of scope:**

- `apps/nest-api/**` — the contract is already sufficient; raise a backend card if it is not
- Drag-and-drop reordering — that needs the `position` semantics settled first, separate card
- Task dependencies — being implemented separately; leave room in the layout but do not build it
- Restyling the admin shell, sidebar or topbar

## Validation

- `bun --cwd=apps/web run typecheck`, `bun --cwd=apps/web run lint`, `bun --cwd=apps/web run test`
- `bun run architecture:check` — note that deep imports across module boundaries are rejected
- Exercise it in a browser against a running API and paste what you did; a screenshot of the
  panel open, and one of a failed save showing the error, are the useful evidence here
- Confirm no new Biome findings: the repo is currently at zero and the pre-commit hook enforces it

## Resolution

<!-- filled by the resolver -->
