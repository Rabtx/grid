---
id: web-project-tree-pagination
title: Project and thread pagination with standalone collapse toggle in project tree
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/project-tree-pagination
worktree: /home/ghost/Projects/grid-worktrees/agent/web/project-tree-pagination
scope:
  - apps/console/**
allowed_shared:
  - .agents/board/**
created: 2026-10-06
updated: 2026-10-06
---

## What

1. In the project sidebar / project tree, paginate threads: default to showing 5 latest threads per project, with a "Load more" / "+X more" affordance to paginate through additional threads.
2. In the project tree, decouple the collapse/expand caret icon from project navigation so clicking the caret/chevron icon only collapses or expands the project tree item without navigating/opening the project.
3. Paginate the projects list itself in the sidebar / project tree: show max 5 projects by default, with a "Load more projects" / "+X more" pagination affordance.
4. Add small quality-of-life improvements: keyboard accessible toggles, clean counters/badges, smooth transitions, and proper tooltips/aria labels adhering to the `@/kit` design system.

## Why / Context

When workspaces have many projects and threads, the sidebar becomes excessively long and difficult to navigate. Users also want to collapse projects without accidentally navigating to the project and disrupting their current view.

## Scope

**In scope:**
- `apps/console/src/modules/shell/components/project-tree.tsx`
- `apps/console/src/modules/shell/**`
- `apps/console/src/kit/nav.tsx`

**Out of scope:**
- Backend API, runner, database schemas.

## Validation

- `bun --cwd=apps/console run test src/modules/shell/components/project-tree.test.tsx`: 3 unit tests passing covering project pagination, thread pagination, and decoupled collapse toggling.
- `bun --cwd=apps/console run test`: 114 test files passed, 641 tests passed.
- `bun --cwd=apps/console run lint`: 0 errors.
- `bun --cwd=apps/console run typecheck`: 0 errors.
- `bun run architecture:check` & `bun run naming:check`: Passed.
- Monorepo `format`, `lint`, and `typecheck`: Clean across all workspaces.

## Resolution

- In `apps/console/src/kit/nav.tsx`:
  - Added support for persistent `trailingAction` in `NavItemProps` and `RowFrame`, placing interactive buttons outside the `<a>` tag so clicks do not bubble into link navigation.
  - Adapted hover/focus padding dynamically (`pr-20` on desktop hover, `pr-7` at rest, `pointer-coarse:pr-9` on touch).
- In `apps/console/src/modules/shell/components/project-tree.tsx`:
  - Added project pagination: limits the rendered project list to 5 by default (`DEFAULT_PROJECT_LIMIT = 5`). Rendered a `NavButton` indicating remaining count ("Show X more projects (Y left)") and a toggle back ("Show fewer projects").
  - Added thread pagination: limits each project's thread list to 5 by default (`DEFAULT_THREAD_LIMIT = 5`). Rendered a `NavButton` indicating remaining count ("Load X more (Y left)") and a toggle back ("Show fewer threads").
  - Decoupled the collapse toggle from navigation: rendered the chevron as a persistent `trailingAction` `<IconButton size="xs">` with `aria-label` and `stopPropagation()`. Clicking the chevron toggles collapse/expand without calling `navigate()`. Clicking the project title/icon navigates to the project.
  - Added QoL reactive adjustments: automatically expands project/thread view limits if the active route points to a project or thread deeper in history.
- In `apps/console/src/modules/shell/components/project-tree.test.tsx`:
  - Added comprehensive component unit tests verifying pagination states and decoupled collapse behavior.
