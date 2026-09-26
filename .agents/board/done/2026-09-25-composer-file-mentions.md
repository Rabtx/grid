---
id: str-composer-file-mentions
title: File mentions with @ autocomplete in chat composer
type: feature
from: human
to: web
priority: normal
status: done
assignee: web
reviewer: human
parent: .agents/plans/agent-chat.md
depends_on: []
branch: agent/web/composer-file-mentions
worktree: ../grid-worktrees/agent/web/composer-file-mentions
scope:
  - apps/console/src/modules/chat/**
  - apps/runner/src/folders/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-26
---

## What

Allow users to type `@` in the chat composer to open an autocomplete popup listing files in the project
folder. Selecting a file attaches or injects the relative path into the prompt with context.

## Why / Context

Typing absolute or relative file paths by hand is error prone. Autocomplete powered by the runner's
folder indexing makes directing agents to specific files frictionless on phone and desktop.

## Changes

1. **Runner endpoint (`apps/runner/src/folders/routes.ts`, `project-files.ts`)**:
   - Added `GET /projects/files/:slug/search?q=` walking project root with limit (cap 50 items, max 5000 scanned, max 10 depth).
   - Skips `.git`, `node_modules`, `dist`, `.next`, `target`, etc.
   - Subsequence and substring match scoring.
   - Goes through runner auth and environment relay (`hub.projectFolders`).
   - Unit tests added in `project-files.test.ts` and route tests in `server.test.ts`.

2. **Files Client Service (`apps/console/src/modules/projects/services/files.service.ts`)**:
   - Added `filesService.search(token, project, query)` calling the runner route through `placementsStore.scopeOf(project)`.

3. **Pure Mention Helpers (`apps/console/src/modules/chat/lib/file-mentions.ts`)**:
   - `findMentionQuery`: detects active `@` token at cursor position (ensures preceding whitespace or start of line, no whitespace inside query).
   - `matchSubsequence`: case-insensitive subsequence matching.
   - `scoreFileMatch`: prioritizes exact filename, filename prefix, substring, then subsequence.
   - `filterAndSortFiles`: client-side fallback and immediate filter.
   - `insertMention`: inserts `@relpath ` at cursor and returns new cursor position.
   - Unit tests in `file-mentions.test.ts`.

4. **Hook (`apps/console/src/modules/chat/lib/use-file-mentions.ts`)**:
   - Debounces runner requests by 150ms.
   - Monotonic request counter for cancelling stale async responses.
   - Fallback to client-side filter of cached project files for instant keystroke feedback.
   - Keyboard navigation: ArrowUp/ArrowDown, Enter/Tab select, Escape close.

5. **Component (`apps/console/src/modules/chat/components/file-mention-popup.tsx`)**:
   - Sits directly above composer on mobile (`bottom-full mb-1.5`) and desktop.
   - Mobile-first styling with coarse-pointer touch targets (`pointer-coarse:h-11`).
   - Auto-scrolls selected item into view.
   - `onMouseDown` prevents textarea blur during touch/click.
   - Component tests in `file-mention-popup.test.tsx`.

6. **Composer Integration (`apps/console/src/modules/chat/components/composer.tsx`)**:
   - Self-contained integration via `useFileMentions` and `<FileMentionPopup />`.
   - Wired in `chat-screen.tsx` and `conversation.tsx` passing `project` prop.
   - Composer integration tests in `composer.test.tsx`.

## Validation

### `bun run typecheck`
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

### `bun run lint`
```
$ bun run --filter '*' lint && bun run scripts:lint
runner lint: Exited with code 0
launcher lint: Exited with code 0
@grid/logger lint: Exited with code 0
console lint: Exited with code 0
docs lint: Exited with code 0
@grid/ui lint: Exited with code 0
nest-api lint: Exited with code 0
web lint: Exited with code 0
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
```

### `bun run format`
```
$ oxfmt --write . && bun run scripts:format && (cd packages/logger/rust && cargo fmt || true)
Finished in 60ms on 541 files using 4 threads.
$ shfmt -i 4 -w scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh || true
```

### `bun run architecture:check`
```
$ bash scripts/architecture/check-boundaries.sh
Running architecture boundary checks...
Architecture checks passed.
Running kebab-case naming checks...
[naming] OK (608 path(s) checked)
```

### Runner Test Suite (`bun --cwd=apps/runner test`)
```
bun test v1.4.2 (744846f84)

 94 pass
 0 fail
 328 expect() calls
Ran 94 tests across 16 files. [701.00ms]
```

### Console Test Suite (`bun --cwd=apps/console run test`)
```
$ vitest run

 RUN  v5.0.1 /home/ghost/Projects/grid-worktrees/agent/web/composer-file-mentions/apps/console

 Test Files  38 passed (38)
      Tests  246 passed (246)
   Start at  04:23:37
   Duration  10.43s (tests 44%, environment 28%, transform 16%, import 10%, worker 2%)
```

## Review

Reviewed and merged in #89 by the lead agent: the combined main passed typecheck, lint,
architecture, and the console (271), runner (104) and API (26) suites. Checked live: the @ popup
lists files from the linked project folder.
