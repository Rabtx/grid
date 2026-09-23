---
id: str-console-task-panel
title: Task panel — open a task, edit its fields, delete it
type: feature
from: human
to: web
priority: high
status: done
assignee: buffy (deepseek-v4-flash)
reviewer: claude
parent: .agents/plans/console-design-migration.md (step 2.1)
depends_on: [str-console-primitives-phase-two]
branch: agent/web/console-task-panel
worktree: ../grid-worktrees/agent/web/console-task-panel
scope:
  - apps/console/src/app.tsx
  - apps/console/src/modules/projects/context/workspace-context.tsx
  - apps/console/src/modules/projects/components/task-card.tsx
  - apps/console/src/modules/projects/components/task-panel.tsx
  - apps/console/src/modules/projects/components/task-panel.test.tsx
  - apps/console/src/modules/projects/lib/relative-time.ts
  - apps/console/src/modules/projects/lib/relative-time.test.ts
  - apps/console/src/modules/projects/index.ts
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
ports: none (no dev server started)
---

## What

Clicking a task card opens that task: a **right-hand side panel on desktop** (the board stays
visible) and a **full-screen sheet on phones**. In it the title, description, status, owner and
branch are editable, and the task can be deleted after a confirmation. The open task lives in the
URL (`/board/:slug/tasks/:number`) so it can be linked and survives a reload.

## Why / Context

Step 2.1 of `.agents/plans/console-design-migration.md`. **Start only after
`2026-09-24-console-primitives-phase-two.md` is merged** — this card uses its `Textarea`,
`Select`, `ConfirmDialog`, `Button variant="danger-solid"` and `Sheet placement="panel"`.

Read first, in order: `AGENTS.md`, `DESIGN.md` → "Product tokens (console)",
`.agents/skills/solid-2/SKILL.md`, `.agents/skills/mobile-first/SKILL.md`, then
`apps/console/src/app.tsx`, everything in `apps/console/src/modules/projects/` and
`apps/console/src/ui/`. Match `new-task-dialog.tsx` for how a sheet form saves, shows errors and
refreshes the board.

The API already supports this (see `apps/docs/content/docs/backend-api.mdx` → "Projects and
tasks"): `PATCH /projects/:slug/tasks/:number` accepts any of `title` (1–200 chars), `description`
(nullable), `status`, `ownerKind` (`"human" | "agent" | null`), `ownerName` (nullable), `branch`
(nullable), `position`; `DELETE` returns 204. The console already has
`projectsService.updateTask(token, slug, number, input)` and `projectsService.deleteTask(...)`.

## Proposal (build exactly this)

1. **Route and state.** Add route `/board/:slug/tasks/:number` rendering the same `BoardRoute`
   (board behind the panel). In `workspace-context.tsx`, derive `activeSlug` from either
   `/board/:slug` or `/board/:slug/tasks/:number` (two `useMatch` calls, or one pattern with a
   splat — check the installed router README), add `activeTaskNumber(): number | null` and
   `activeTask(): Task | null` (found in `tasks()`), and `openTask(number)` / `closeTask()` that
   navigate between the two URLs (keep the current search string so board filters survive).
2. **Card becomes a link.** `task-card.tsx`: wrap the card in an `<a href=/board/:slug/tasks/:n>`
   (plain anchor — the router intercepts it) with `focus-ring`, hover `bg-ink/8`,
   `active:scale-[0.98]`, `transition-[background-color,transform] duration-fast ease-out-grid`.
   Keep the card's content and the `data-*` hooks unchanged.
3. **`task-panel.tsx`**, mounted once next to the board inside `BoardRoute`, using
   `<Sheet placement="panel" open={Boolean(activeTask())} onClose={closeTask} label={title}>`:
   - Header row (`h-10`, `border-b border-stroke`, `px-3`): key in `font-mono text-ui-xs
     text-ink/45`, "· updated <relative time>" in `text-ink/35`, then right-aligned a delete
     `IconButton` (hover `text-danger bg-danger/10`) and a close `IconButton`.
   - Body (`p-4`, `flex flex-col gap-4`, scrolls): the **title** as a borderless input
     (`text-title font-semibold bg-transparent`, placeholder "Task title"), saved on blur and on
     Enter; empty is rejected (restore the old value). Then label/value rows (`w-24 text-ui-sm
     text-ink/45` label on the left from `md:`, stacked on phones): **Status** (`Select` of the
     seven stages, `TASK_STATUS_LABELS`), **Owner** (`SegmentedControl` None / Human / Agent plus a
     name `Input` shown when not None), **Branch** (`Input` with `font-mono`, placeholder
     `agent/role/card-slug`). Each saves on change/blur. Then **Description**: `Textarea`
     (plain text, `whitespace-pre-wrap` when read back), saved on blur.
   - Saving: call `updateTask` with only the changed field, then `refreshTasks()`. While saving
     show a quiet "Saving…" in the header (`text-ink/40 text-ui-xs`); on failure an `ErrorNotice`
     at the top of the body with the API message, and restore the field.
   - Delete: `ConfirmDialog` "Delete TASK-n?" / "This can't be undone." / confirm "Delete task",
     `tone="danger"`; on confirm `deleteTask`, then `closeTask()` and `refreshTasks()`.
   - Unknown task number (tasks loaded, no match): the panel shows `EmptyState` "Task not found"
     with a "Back to the board" button.
4. **`lib/relative-time.ts`**: `relativeTime(iso, now = Date.now())` → "just now" (< 1 min),
   "4m", "3h", "yesterday", "5d", then a short date ("Sep 3"). Unit-test it.
5. **Tests** (`task-panel.test.tsx`, happy-dom, follow `routes/app-shell.test.tsx` for the fetch
   stub + router + `AuthProvider` + `WorkspaceProvider` setup, start at
   `/board/alpha/tasks/1`): the panel shows the task's title and fields; changing Status sends a
   `PATCH` with `{ status }` to `/projects/alpha/tasks/1`; deleting after confirm sends `DELETE`
   and closes the panel; an unknown number shows "Task not found". Stub `showModal`/`close` on
   `HTMLDialogElement.prototype` if happy-dom lacks them.

## Scope

**In scope:** the files in `scope`. **Out of scope:** `board-screen.tsx`, `board-lanes.tsx`,
`stage-tabs.tsx`, `lib/board.ts` (another card changes those in parallel), `ui/` (use it, don't
change it — if a primitive is missing something, note it in Resolution), tokens, the API.
Markdown rendering of the description is deferred. Never name any external product or project.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `typecheck` · `build` · `bun run lint` · `bun run format` ·
  `bun run architecture:check`
- The dev servers on ports 3000, 3001 and 4000 belong to the human — do not start or stop
  anything on them. The reviewer tests the panel in a browser at 375 and 1280 px.

## Resolution

**Changed**

- `apps/console/src/app.tsx` — route `/board/:slug/tasks/:number` renders the same `BoardRoute`,
  which now mounts `<TaskPanel />` beside `<BoardScreen />`.
- `apps/console/src/modules/projects/context/workspace-context.tsx` — `activeSlug` is derived from
  either board URL; added `activeTaskNumber()`, `activeTask()`, `openTask(number)` and
  `closeTask()`, both navigating between the two URLs and carrying the current search string so
  board filters survive.
- `apps/console/src/modules/projects/components/task-card.tsx` — the card is an `<a>` to the task's
  URL (focus ring, hover `bg-ink/8`, `active:scale-[0.98]`, colour/transform transition); content
  and `data-*` hooks unchanged.
- `apps/console/src/modules/projects/components/task-panel.tsx` (new) — header (key, "· updated
  4m", quiet "Saving…", delete + close `IconButton`s), borderless title input, Status / Owner /
  Branch / Description rows, `ConfirmDialog` delete, "Task not found" `EmptyState`, and a skeleton
  while the board's first read settles.
- `apps/console/src/modules/projects/lib/relative-time.ts` (new) — `relativeTime(iso, now)`:
  "just now", "4m", "3h", "yesterday", "5d", then "Sep 3".
- `apps/console/src/modules/projects/components/task-panel.test.tsx` (new) — 4 happy-dom tests:
  fields render from the URL, a Status change `PATCH`es only `{ status }`, delete needs the
  confirmation then closes the panel, and an unknown number shows "Task not found".
- `apps/console/src/modules/projects/lib/relative-time.test.ts` (new) — 4 threshold tests.
- `apps/console/src/modules/projects/index.ts` — exports `TaskPanel`.

**Validation** (worktree root, real tails)

```text
$ bun --cwd=apps/console run test
 ✓  dom  src/modules/projects/components/task-panel.test.tsx (4 tests) 553ms
 ✓  logic  src/modules/projects/lib/relative-time.test.ts (4 tests) 7ms
 Test Files  8 passed (8)
      Tests  41 passed (41)

$ bun --cwd=apps/console run typecheck
$ tsc --noEmit                     # exit 0, no diagnostics

$ bun --cwd=apps/console run build
dist/assets/index-DmP_oaDs.js  130.53 kB │ gzip: 44.15 kB
✓ built in 404ms

$ bun run lint
console lint: Found 0 warnings and 0 errors.
web lint: Exited with code 0        # 9 pre-existing warnings, all in apps/web

$ bun run format
Finished in 28ms on 365 files       # formatted nothing outside this card's scope

$ bun run architecture:check
Architecture checks passed.
[naming] OK (468 path(s) checked)
```

No dev server was started: ports 3000, 3001 and 4000 were not touched. The tests were also run
per-file to confirm the panel's new code emits no Solid dev diagnostics
(`STRICT_READ_UNTRACKED`, `ASYNC_OUTSIDE_LOADING_BOUNDARY`) — the remaining console warnings in a
full run all come from pre-existing code.

**Deliberate deviations from the brief** (each one had a concrete reason)

1. `Sheet` label is `Task <number>`, not the task title. Reading `activeTask()` in the Sheet's own
   props read the board's first load outside the `Loading` boundary: Solid reported
   `ASYNC_OUTSIDE_LOADING_BOUNDARY` and deferred the whole app's first render until projects and
   tasks settled. The panel body still names the task (key plus editable title).
2. `open={activeTaskNumber() !== null}` instead of `open={Boolean(activeTask())}` — with the
   brief's form the "Task not found" state could never render, because a missing task keeps the
   sheet shut.
3. Header rows use `min-h-10` rather than a fixed `h-10`: `--spacing-control` is 44px on a coarse
   pointer, so the 44px icon buttons would otherwise cross the header's divider.
4. Drafts are seeded in an effect keyed on the task's *number*, with an explicit `untrack`ed read.
   Re-seeding on every task object would wipe an edit still being typed when another field's save
   triggers `refreshTasks()`.
5. Missing primitive: `@/ui` has no trash icon, so `TrashIcon` is drawn locally in
   `task-panel.tsx` on the same 24px grid and 1.75 stroke. It belongs in `ui/icons.tsx` the next
   time the ui-ux owner touches that set — `ui/` itself was not changed here, as the card requires.
6. `task-card.tsx` reads `useWorkspace()` for the project slug its href needs, so `board-lanes.tsx`
   (out of scope) keeps calling `<TaskCard task={…} />` unchanged.
7. `task-card.tsx` also carries an `aria-label` (key + title): the anchor wraps a whole card, and
   `jsx-a11y/control-has-associated-label` cannot see text inside the nested `<article>`.

**Not done / deferred:** Markdown rendering of the description (deferred by the card); browser
verification at 375 and 1280 px is the reviewer's step.

**Review:** branch pushed, PR to `main` open, not merged — reviewer: claude.

**Commit:** `80cb1ad` (feature); the claim and this resolution are separate `chore`/`docs` commits.
