---
id: str-task-detail-edit
title: Give a task a detail view so it can be edited, reassigned and deleted
type: feature
from: pm
to: web
priority: normal
status: done
assignee: web
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
- Confirm no new lint findings: the repo is currently at zero and the pre-commit hook enforces it

## Resolution

<!-- filled by the resolver -->

### Changed

- `apps/web/src/modules/projects/components/task-detail-sheet.tsx` (new) — right-side `Sheet`
  detail panel opened from a board card. Edits title, description, status, owner kind + owner
  name, branch and position via `useUpdateTaskMutation`; delete sits behind an `AlertDialog`
  confirmation wired to `useDeleteTaskMutation`, closing the sheet on success. Handles loading,
  not-found/empty, load-error, saving, saved, save-failed and delete-failed states; form state is
  local and a failed save keeps what was typed (error renders as a destructive `Alert`, inputs
  stay filled).
- `apps/web/src/modules/projects/components/board-screen.tsx` — cards are now buttons that open
  the detail sheet; the per-card status select was **removed** so status has exactly one control
  (inside the panel), per the card's "no two controls that can disagree" rule. Project switch
  clears the open task.
- `apps/web/src/modules/projects/hooks/use-project-mutations.ts` — added `useDeleteTaskMutation`
  beside the existing mutations (service call + tasks invalidation).
- `apps/web/src/modules/projects/lib/task-form.ts` (new) — pure `toTaskFormValues` /
  `buildUpdateTaskInput` / `parsePosition` helpers for the panel form.
- `apps/web/src/modules/projects/lib/task-form.test.ts` (new) — unit tests for those helpers.
- `apps/web/src/modules/projects/index.ts` — export `useDeleteTaskMutation` alongside the other
  mutations.

Decisions recorded:

- Status lives only in the panel (card item 4: move it into the panel).
- `position` is exposed as a plain number input (not drag-and-drop, which stays out of scope) so
  every PATCH field the API accepts is editable, per the request.
- Save sends the full field payload so the strict `updateTaskSchema` always receives ≥1 key.
- Blank owner name clears owner (`ownerKind: null, ownerName: null`), matching the DTO.

### Validation

- `bun --cwd=apps/web run typecheck`: pass (`tsc --noEmit`, no output)
- `bun --cwd=apps/web run lint`: pass (repo linter, 107 files, 0 findings after `lint:fix`)
- `bun --cwd=apps/web run test`: pass (6 files, 31 tests, includes new `task-form.test.ts`)
- `bun run architecture:check`: pass (boundaries + kebab-case naming, 392 paths)
- Browser exercise against a running API: **not done** — no API/web stack is running in this
  session (`localhost:4000` and `:3000` unreachable) and no browser tooling was available; panel
  screenshots of open/failed-save still owe evidence to the reviewer.

### Contract impact

- none — UI-only; no API, docs or schema change.

### Review

- reviewer: reviewer — pending

### Commit

- none — committing was explicitly out of scope for this pass.

### Review note

Verified on review rather than taken from the report: preflight 5/5+4/4+3/3, build 3/3,
31 web tests. The per-card status select is gone, so status has exactly one control; the
remaining select on the board is the project switcher. `parsePosition` enforces the same
0..1_000_000 bound the zod DTO declares. The form reseeds only when the task number changes,
so a background refetch cannot clobber typing, and `setValues` runs only in `onSuccess`, so a
failed save keeps what was typed. Cards are real buttons with a focus ring.

Still owed, as the assignee recorded: exercising this in a browser against a running API and
database. Nothing has applied migration 0004 yet, so that is blocked on the schema-proof card.
