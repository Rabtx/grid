---
id: str-project-files
title: Browse and create files and folders inside each project
type: feature
from: human
to: web
priority: high
status: doing
assignee: codex
reviewer: human
parent: none
depends_on: []
branch: agent/web/project-files
worktree: ../grid-worktrees/agent/web/project-files
scope:
  - apps/console/src/app.tsx
  - apps/console/src/modules/projects/**
  - apps/console/src/modules/shell/**
  - apps/console/src/ui/**
  - apps/runner/src/folders/**
  - apps/runner/src/server.test.ts
  - .agents/board/doing/2026-09-25-project-files.md
allowed_shared:
  - apps/runner/src/folders/**
  - apps/runner/src/server.test.ts
created: 2026-09-25
updated: 2026-09-25
---

## What

Add Files to each linked project, alongside Threads and Board. Show the real folder hierarchy
with recognizable file and folder icons. Let people create a file or folder in the current
directory and open actions with right click, touch long press, or an accessible menu button.

## Why / Context

Projects already link to a local folder, but Grid cannot show its contents. People need to see
and organize the files agents work on before a later editor area is built.

## Acceptance criteria

- Files is reachable from project navigation on phone and desktop; it respects the existing
  console design and linked project folder.
- Browse nested directories with a clear path, loading, empty, offline, error, and retry states.
- Create files and folders with safe names and no overwrite. The runner confines operations to
  the linked project root, including symlinks and path traversal.
- Right click and touch long press open the same file action menu as the visible row button.
  Initial actions are context-appropriate and functional; file editing is deferred.
- Keyboard navigation and focus work, touch targets are at least 44 px, and a 320 px screen has
  no horizontal overflow. Large folders remain responsive.

## Scope

**In scope:** the paths in frontmatter. Runner paths are the coordinated backend portion of this
human-requested slice; human reviews the combined result.

**Out of scope:** editor, file content preview, uploads, deletion, rename, drag and drop, and
remote execution environments.

## Validation

- `bun --cwd=apps/runner run test`: 54 passed, including traversal, symlink, no-overwrite,
  missing-link, and auth cases.
- `bun --cwd=apps/console run test`: 186 passed, including new folder navigation and file
  creation tests.
- `bun run lint`, `bun run typecheck`, `bun run format`,
  `bun run architecture:check`, and `bun --cwd=apps/console run build`: passed. Root lint
  reports warnings in untouched docs, shared UI, and web files.
- Headless Chromium against isolated runner `:4101` and console `:3006`: 320, 375, 768, and
  1280 px had no document overflow or page errors. Created a folder, opened the file menu by
  right click and by a touch pointer long press. Screenshots: `/tmp/grid-files-{width}.png`.

## Resolution

Changed: the project Files route, navigation, file list and creation UI, and runner file routes.
Folders are read one level at a time; common generated directories are omitted to keep the list
responsive. Files is route-loaded as a 7.44 kB build chunk. The linked folder remains the sole
filesystem authority. Contract impact: new authenticated runner endpoints
`GET/POST /projects/files/:slug`; no Nest API or database schema change. Browser checks used
a disposable folder and isolated runner database. Review: human pending. Commit: pending.
