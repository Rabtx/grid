---
id: str-task-agent-runs
title: Run with agent: launch chat sessions directly from board task cards
type: feature
from: human
to: web
priority: normal
status: review
assignee: web
reviewer: human
parent: .agents/plans/agent-chat.md
depends_on: []
branch: agent/web/task-agent-runs
worktree: ../grid-worktrees/agent/web/task-agent-runs
scope:
  - apps/console/src/modules/projects/**
  - apps/console/src/modules/chat/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-26
---

## What

Add a "Run with agent" action on board task cards and the task details panel. Clicking it opens a chat
session pre-seeded with the task title, description, and target branch.

## Why / Context

Bridging board tasks directly to agent runs turns the board into an active command center where
tasks are dispatched to agents with a single click.

## Implementation Details

- Added "Run with agent" item to `TaskCard`'s existing action menu (`task-card.tsx`).
- Updated `task-panel.tsx` header button from "Start a thread" to "Run with agent".
- Updated `taskDraft` in `apps/console/src/modules/chat/stores/drafts.ts` to format seed text from task title, markdown description, and `Work on branch <branch>` when present.
- Exported `draftsStore` and `taskDraft` from `@/modules/chat`.
- Added unit tests in `drafts.test.ts`, `task-panel.test.tsx`, and `task-card.test.tsx`, and updated `board-screen.test.tsx`.

## Task ID on Thread Note

Per card constraints:
> Remember the thread came from the task: store the task id on the new thread if that fits the existing thread type cleanly, so later work can show "running" on the card. If it doesn't fit, say so on the card rather than hacking it in.

`ChatSession` and the runner's `/chat/sessions` SQLite schema only support:
`{ id, project, provider, title, cwd, model, mode, effort, createdAt, updatedAt }`.
Attaching a persistent `taskId` requires schema and API migrations in `apps/runner`, which is outside this card's scope (`apps/console/src/modules/projects/**` and `apps/console/src/modules/chat/**`). As instructed, rather than hacking it in, this is documented here for subsequent backend/runner card work.

## Validation Output

### 1. `bun run typecheck`
```
$ bun run --filter '*' typecheck
@grid/logger typecheck: Exited with code 0
launcher typecheck: Exited with code 0
runner typecheck: Exited with code 0
@grid/ui typecheck: Exited with code 0
console typecheck: Exited with code 0
web typecheck: Exited with code 0
nest-api typecheck: Exited with code 0
```

### 2. `bun run lint`
```
$ bun run --filter '*' lint && bun run scripts:lint
launcher lint: Exited with code 0
runner lint: Exited with code 0
console lint: Exited with code 0
@grid/logger lint: Exited with code 0
nest-api lint: Exited with code 0
docs lint: Exited with code 0
@grid/ui lint: Exited with code 0
web lint: Exited with code 0
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
```

### 3. `bun run format`
```
$ oxfmt --write . && bun run scripts:format && (cd packages/logger/rust && cargo fmt || true)
Finished in 61ms on 537 files using 4 threads.
$ shfmt -i 4 -w scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh || true
```

### 4. `bun run architecture:check`
```
$ bash scripts/architecture/check-boundaries.sh
Running architecture boundary checks...
Architecture checks passed.
Running kebab-case naming checks...
[naming] OK (604 path(s) checked)
```

### 5. `bun --cwd=apps/console run test`
```
$ vitest run

 RUN  v5.0.1 /home/ghost/Projects/grid-worktrees/agent/web/task-agent-runs/apps/console


 Test Files  37 passed (37)
      Tests  233 passed (233)
   Start at  04:01:39
   Duration  8.85s (environment 34%, tests 34%, transform 18%, import 12%, worker 2%)
```
