---
id: str-files-editor
title: Edit files in Files — a quick, safe code editor
type: feature
from: human
to: web
priority: high
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: agent/web/files-editor
worktree: ../grid-worktrees/agent/web/files-editor
scope:
  - apps/console/src/modules/projects/components/files-screen.tsx
  - apps/console/src/modules/projects/components/**
  - apps/console/src/modules/projects/services/files.service.ts
  - apps/console/src/kit/**
  - apps/runner/src/folders/**
  - apps/console/package.json
  - bun.lock
allowed_shared:
  - bun.lock
created: 2026-09-28
updated: 2026-09-28
---

## What

Roadmap A4. The Files page reads files today (list and reader, `files-screen.tsx`, runner
`GET /projects/files/:slug/content`). Make it a quick way to edit them: open a file, edit, save.

## Why / Context

People want small fixes without opening an IDE or asking an agent. See
`.agents/plans/product-roadmap.md` (A4). A local reference app with a good editor is at
`~/Projects/monocode` (read its file editor for ideas only; never copy its code or name it in
this repo).

## Proposal or Ask

- **Editor:** CodeMirror 6, lazy-loaded only when a file is opened for editing (keep the reader
  for viewing): syntax colouring by file type, search (Ctrl/⌘+F), line numbers, Ctrl/⌘+S to save,
  a dirty dot on the file's row and tab, undo/redo. Theme it from the kit's tokens (light and dark).
- **Save safely:** a runner write route with the same folder containment as reading
  (`folders/project-files.ts`): `PUT /projects/files/:slug/content` with `{ path, text, base }`,
  where `base` is the hash of the text as opened; the runner refuses (409) when the file changed
  on disk since, and the console offers "Reload" or "Overwrite". Refuse binary and too-large files.
- **Diff:** a "Changes" toggle showing the edit against the file as opened (the kit's `DiffCard`).
- **Phones:** files open read-only with an Edit button; editing works but is not the default.
- **New file** already exists; after creating one, open it in the editor.
- Leaving with unsaved changes asks first.

Definition of done: edit and save a file from the browser on desktop and phone, a stale save is
refused with a clear choice, and nothing outside the project folder can be written.

## Scope

**In scope:** the Files screen and its components, the files service, kit pieces the editor
needs, the runner's project-files and folder routes, CodeMirror packages.

**Out of scope:** "ask the agent about this selection" (later), git staging/commits, the chat.

## Validation

- Runner tests for the write route: containment (`..`, absolute paths, symlinks out), the stale
  hash refusal, binary and size limits.
- Console tests: open → edit → save, dirty state, stale-save choice, leave-with-changes prompt.
- `bun run lint`, `bun run typecheck`, `bun run architecture:check`, the kit guard
  (`src/styles/kit-guard.test.ts`).
- A screenshot on desktop and at phone width.

## Resolution
