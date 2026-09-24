---
id: str-console-move-tasks
title: Move tasks between stages — menu on every card, drag and drop on pointer devices
type: feature
from: human
to: web
priority: normal
status: done
assignee: buffy (deepseek-v4-flash)
reviewer: claude
parent: .agents/plans/console-design-migration.md (step 2.3)
depends_on: [str-console-primitives-phase-two, str-console-board-views-filters, str-console-task-panel]
branch: agent/web/console-move-tasks
worktree: ../grid-worktrees/agent/web/console-move-tasks
scope:
  - apps/console/src/modules/projects/components/task-card.tsx
  - apps/console/src/modules/projects/components/board-screen.tsx
  - apps/console/src/modules/projects/components/stage-tabs.tsx
  - apps/console/src/modules/projects/components/board-lanes.tsx
  - apps/console/src/modules/projects/components/board-screen.test.tsx
  - apps/console/src/modules/projects/lib/move-task.ts
  - apps/console/src/modules/projects/lib/move-task.test.ts
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Let people move a task to another stage straight from the board: a **"Move to…" menu on every
card** (works everywhere, including touch) and **drag and drop between lanes** on devices with a
fine pointer. Moves feel instant — the card moves first, the API call follows, and a failed call
puts it back with an error.

## Why / Context

Step 2.3 of `.agents/plans/console-design-migration.md`. **Start only after the three cards in
`depends_on` are merged** — this uses the `Menu` primitive, the generalised lanes from the views
card and the card-as-link from the task panel card. Read first, in order: `AGENTS.md`,
`DESIGN.md` → "Product tokens (console)" and "Interaction", `.agents/skills/solid-2/SKILL.md`,
`.agents/skills/mobile-first/SKILL.md` (see "Behaviour belongs in CSS": branch on capability,
not width), then everything in `apps/console/src/modules/projects/` and `apps/console/src/ui/`.

API: `PATCH /projects/:slug/tasks/:number` with `{ status, position }` moves a task
(`projectsService.updateTask`). Moving to another stage appends it: `position` = the highest
position in the target stage + 1 (0 when empty). Reordering inside a stage is out of scope.

## Proposal (build exactly this)

1. **`lib/move-task.ts`** (unit-tested): `nextPosition(tasks, status)` and
   `applyMove(tasks, number, status)` returning a new task array with that task moved (status and
   position updated) — used for the optimistic update.
2. **Optimistic state.** Keep the moved tasks in a local overlay (a signal holding
   `{ number, status, position } | null` per pending move, or Solid 2's `createOptimistic` if you
   verify its API in the installed typings — `apps/console/node_modules/solid-js/types`). Lanes
   render `applyMove(...)` of the workspace tasks. On success call `refreshTasks()` and clear the
   overlay; on failure clear it and show an `ErrorNotice` "Couldn't move TASK-n: <reason>" above
   the lanes for 6 seconds (or until dismissed).
3. **Card menu.** In `task-card.tsx`, a `Menu` (label "Move TASK-n") in the card's top-right with
   a small "more" icon (add nothing to `ui/`; draw the three-dots icon inline in the card file if
   `ui/icons.tsx` has none), items = the six other stages with their `StatusIcon`. The menu button
   sits **outside** the card's link (so it doesn't navigate) and stops propagation. On pointer
   devices it's revealed on hover/focus (`opacity-0 group-hover:opacity-100
   focus-visible:opacity-100` inside `@media (hover: hover)`); on touch it is always visible.
4. **Drag and drop, fine pointers only.** Enable HTML5 drag on cards and drop on lanes only when
   `matchMedia("(pointer: fine)")` matches (read once in one place). While dragging: the card at
   `opacity-50`; the lane under the pointer gets `bg-selection-subtle rounded-lg`; dropping calls
   the same move function as the menu. Dropping on the task's own stage does nothing. Only the
   **By status** view accepts drops (By owner lanes don't change status).
5. **Tests**: `move-task.test.ts` covers both helpers; in `board-screen.test.tsx`, choosing
   "In progress" from a card's menu moves the card into that lane immediately and sends
   `PATCH { status: "in_progress", position: N }`; a failing `PATCH` puts the card back and shows
   the error.

## Scope

**In scope:** the files in `scope`. **Out of scope:** `ui/`, the task panel, the toolbar and
filters, tokens, the API, reordering within a lane. Never name any external product or project.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `typecheck` · `build` · `bun run lint` · `bun run format` ·
  `bun run architecture:check`
- The dev servers on ports 3000, 3001 and 4000 belong to the human — do not start or stop
  anything on them. The reviewer tests moving by menu (375 px, touch emulation) and by drag
  (1280 px) in a browser.

## Resolution

Started by buffy (deepseek-v4-flash), which stalled with the work uncommitted; finished by the
reviewer (claude) after merging main.

### What changed

- `lib/move-task.ts` (+ tests): `nextPosition` and `applyMove`, as proposed.
- `board-lanes.tsx`: pending moves are laid over the lane tasks, so a card changes lane at once.
  A move that lands stays in the overlay until the re-read tasks arrive, so the card never jumps
  back in between; a rejected move is dropped and "Couldn't move TASK-n: <reason>" shows above
  the lanes for 6 s or until dismissed. Stage lanes are drop targets when `(pointer: fine)`
  matches (read once); the handlers sit on a plain wrapper, not the lane landmark.
- `task-card.tsx`: a "Move TASK-n" `Menu` with the other six stages, a sibling of the card link
  (never navigates), always visible on touch and revealed on hover/focus where hovering exists.
  Uses `MoreIcon` from `@/ui`; the agent's inline copy was removed.
- Reviewer fixes outside the original scope, needed for the feature to work:
  - `board-screen.tsx`, `stage-tabs.tsx`: `BoardLane.icon` is now `() => JSX.Element`. It was one
    DOM node inserted by both the stage tabs and the lane header, so one of them always lost it
    (the agent had deleted the header icon to dodge this).
  - Counts render as strings: happy-dom drops a `0` text node, and the next count update then
    crashed the board ("Cannot set properties of null (setting 'data')").
- `board-screen.test.tsx`: fixed the agent's test (undefined `body`, a missing newline) and added
  menu, optimistic move and rejected move tests.

### Validation output

```text
$ bunx vitest run
 Test Files  10 passed (10)
      Tests  61 passed (61)
$ bun run typecheck            # tsc --noEmit, clean
$ bun run build
✓ built in 601ms
$ bunx oxlint apps/console     # exit 0, no warnings
$ bun run lint                 # all workspaces exit 0
$ bun run architecture:check
[naming] OK (476 path(s) checked)
```

### Browser check

Not done by the reviewer: the browser was signed out and agents may not enter passwords. The
human tests the menu at 375 px (touch) and drag at 1280 px.

### Contract impact

- none: uses the existing `PATCH /projects/:slug/tasks/:number`.
