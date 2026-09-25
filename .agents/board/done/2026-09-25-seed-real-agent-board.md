---
id: str-seed-real-agent-board
title: Seed real agent board cards into Grid database and delete fake starter board
type: feature
from: human
to: backend
priority: high
status: done
assignee: antigravity
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: []
branch: agent/backend/seed-real-agent-board
worktree: ../grid-worktrees/agent/backend/seed-real-agent-board
scope:
  - apps/nest-api/src/database/seed.ts
  - .agents/board/done/2026-09-25-seed-real-agent-board.md
  - .agents/board/open/2026-09-25-composer-file-mentions.md
  - .agents/board/open/2026-09-25-diff-viewer.md
  - .agents/board/open/2026-09-25-project-notes.md
  - .agents/board/open/2026-09-25-task-agent-runs.md
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Replace the static dummy tasks on the Grid project board in the database with the real cards from `.agents/board/`.
1. Update `apps/nest-api/src/database/seed.ts` to dynamically discover and parse all cards from `.agents/board/` (across `open/`, `doing/`, and `done/`).
2. Extract real metadata: title, description (from `## What` or body), status, ownerKind (`agent` vs `human`), ownerName (e.g. `claude`, `antigravity`, `codex`, `opencode`, `buffy`, etc.), and branch.
3. Clean out the old fake starter tasks from the database and re-seed with the authentic Grid project tasks so that the board inside the Grid console displays the true agent work history.
4. Added upcoming roadmap cards to `.agents/board/open/` (`project-notes`, `composer-file-mentions`, `diff-viewer`, `task-agent-runs`) so `backlog` and `ready` lanes show real planned features.

## Why / Context

The Grid board previously contained mock placeholder tasks created early in development (`GRID_TASKS`). Now that extensive work has been completed across 45+ cards by various agents, the Grid board should show the real tasks, owners, and branches.

## Validation

- `bun --cwd=apps/nest-api run db:seed`: successfully seeded project "grid" with 51 real tasks (47 completed agent cards, 4 open roadmap tasks).
- `bun --cwd=apps/nest-api run test`: 7 test files passed (23 tests).
- `bun --cwd=apps/console run test`: 32 test files passed (197 tests).
- `bun run typecheck`: clean across all workspaces.
- `bun run lint`: oxlint & shellcheck passed.
- `bun run format`: oxfmt & shfmt clean.
- `bun run architecture:check && bun run naming:check`: all 578 paths passed.

## Resolution

All fake board tasks were removed. The database seed now automatically loads and synchronizes all real agent cards from `.agents/board/` into the Grid board in Postgres, preserving titles, descriptions, assignees, branches, and statuses.
