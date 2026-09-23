---
id: str-console-board-views-filters
title: Board views and filters — by status / by owner, text and owner filters
type: feature
from: human
to: web
priority: high
status: done
assignee: opencode (space-bunny-free)
reviewer: claude
parent: .agents/plans/console-design-migration.md (step 2.2)
depends_on: []
branch: agent/web/console-board-views-filters
worktree: ../grid-worktrees/agent/web/console-board-views-filters
scope:
  - apps/console/src/modules/projects/components/board-screen.tsx
  - apps/console/src/modules/projects/components/board-lanes.tsx
  - apps/console/src/modules/projects/components/stage-tabs.tsx
  - apps/console/src/modules/projects/components/board-toolbar.tsx
  - apps/console/src/modules/projects/components/board-screen.test.tsx
  - apps/console/src/modules/projects/lib/board.ts
  - apps/console/src/modules/projects/lib/board.test.ts
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Add a toolbar above the board with a **By status / By owner** view switch, a **text filter**
(title or key) and an **owner filter**. "By owner" groups the same tasks into one lane per owner.
View and filters live in the URL so a filtered board can be shared.

## Why / Context

Step 2.2 of `.agents/plans/console-design-migration.md`. The board currently always groups by
stage and shows every task. Read first, in order: `AGENTS.md`, `DESIGN.md` → "Product tokens
(console)", `.agents/skills/solid-2/SKILL.md`, `.agents/skills/mobile-first/SKILL.md`, then all of
`apps/console/src/modules/projects/` and `apps/console/src/ui/`. Use the existing primitives
(`SegmentedControl`, `Input`, `SearchIcon`, `EmptyState`); if a `Select` primitive exists in
`ui/` when you start, use it for the owner filter, otherwise a native `<select>` styled like
`Input` (`h-field rounded-md border border-ink/12 bg-canvas/40 px-2.5 text-ui-input`).

Task data comes from `useWorkspace().tasks()` (see `context/workspace-context.tsx`); each task has
`key`, `title`, `status`, `owner: { kind: "human" | "agent"; name: string | null } | null`.

## Proposal (build exactly this)

1. **Pure logic in `lib/board.ts`** (unit-tested in `lib/board.test.ts`, following the existing
   tests there):
   - `filterTasks(tasks, { query, owner })`: `query` matches title or key, case-insensitive,
     trimmed, empty matches all; `owner` is `"all"`, `"unassigned"`, or an owner key.
   - `ownerKey(task)`: `"unassigned"` when no owner, else `${kind}:${name ?? kind}`;
     `ownerLabel(task)`: `"Unassigned"` or the name (fallback: `"Human"` / `"Agent"`).
   - `groupByOwner(tasks)`: ordered lanes `{ id, title, tasks }[]` — Unassigned first (only when
     it has tasks), then humans, then agents, each alphabetical; preserve task order inside a lane.
   - `ownerOptions(tasks)`: `[{ value: "all", label: "All owners" }, { value: "unassigned",
     label: "Unassigned" }, …one per distinct owner]`.
2. **Generalise the lanes.** `BoardLanes` and `StageTabs` take a lane list instead of assuming
   the seven stages: `lanes: { id: string; title: string; icon: JSX.Element; tasks: Task[] }[]`.
   The status view builds lanes from `TASK_STATUSES` with `<StatusIcon>`; the owner view uses a
   small circle (`size-3.5 rounded-full`, dashed `border-ink/30` for Unassigned, `bg-ink/20`
   otherwise). Keep everything else about lanes as it is (ids `lane-<id>`, `data-status` becomes
   `data-lane`, the IntersectionObserver swipe sync, `data-count` hooks, empty lane "No tasks").
3. **`board-toolbar.tsx`** — mobile first:
   - Phones: the filter input on its own full-width row (leading `SearchIcon` at `text-ink/40`,
     placeholder "Filter tasks", `type="search"`, `enterkeyhint="search"`), then a row with the
     segmented view switch and the owner select.
   - From `md:`: one row — segmented switch left, owner select and a `w-60` filter input right.
   - `SegmentedControl` label "Board view", options By status / By owner.
4. **URL state** with `useSearchParams` from `@solidjs/router` (read the installed README section
   "Typed Search Params" / `useSearchParams` in `apps/console/node_modules/@solidjs/router/README.md`
   for the current API): `view` (`status` default, omitted from the URL), `q`, `owner` (`all`
   default, omitted). Typing in the filter updates `q` with `replace: true` (no history entry per
   keystroke).
5. **Empty result:** when filters hide every task, show one `EmptyState` "No tasks match these
   filters" with a "Clear filters" link-style button that resets `q` and `owner`, instead of seven
   empty lanes.
6. The phone task count line reads "N of M tasks" when filtered.
7. **Tests** in `board-screen.test.tsx` (keep the existing setup and tests passing): switching to
   By owner renders one lane per owner with the right counts; a query hides non-matching cards;
   the empty-result state appears and Clear filters restores all tasks.

## Scope

**In scope:** the files in `scope` above. **Out of scope:** `task-card.tsx`,
`context/workspace-context.tsx`, `app.tsx`, the shell, `ui/` and tokens (another card is adding
primitives in parallel — do not edit `ui/`). Never name any external product or project.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `typecheck` · `build` · `bun run lint` · `bun run format` ·
  `bun run architecture:check`
- The dev servers on ports 3000, 3001 and 4000 belong to the human — do not start or stop
  anything on them. The reviewer checks the board in a browser at 375 and 1280 px.

## Resolution

Changed:
- `components/board-toolbar.tsx`, `components/board-screen.tsx`, `components/board-lanes.tsx`, and
  `components/stage-tabs.tsx`
- `lib/board.ts`, `lib/board.test.ts`, and `components/board-screen.test.tsx`

Validation:
- `bun --cwd=apps/console run test` — exit 0:
  ```
  Test Files  6 passed (6)
       Tests  29 passed (29)
    Duration  6.19s
  ```
- `bun --cwd=apps/console run typecheck` — exit 0:
  ```
  $ tsc --noEmit
  ```
- `bun --cwd=apps/console run build` — exit 0:
  ```
  ✓ 104 modules transformed.
  ✓ built in 1.31s
  ```
- `bun run lint` — exit 0 (warnings only):
  ```
  $ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
  ```
- `bun run format` — exit 0:
  ```
  Finished in 37ms on 358 files using 4 threads.
  $ shfmt -i 4 -w scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh || true
  ```
- `bun run architecture:check` — exit 0:
  ```
  Architecture checks passed.
  [naming] OK (461 path(s) checked)
  ```
- No service on ports 3000, 3001, or 4000 was started or stopped. Browser review at 375 and 1280 px
  remains with the named reviewer, as specified by the card.

Contract impact:
- None. Existing task data is unchanged; view and filter state is client-side URL query state.

Review:
- `claude` — pending in the pull request; the branch will not be merged by the implementation agent.

Commit:
- `acdfb3a` — `feat(console): add board views and filters`
