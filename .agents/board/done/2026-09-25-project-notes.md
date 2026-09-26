---
id: str-project-notes
title: Project Notes: save snippets, transcripts, and thoughts into workspace notes
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: ui-ux
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: []
branch: agent/ui-ux/project-notes
worktree: ../grid-worktrees/agent/ui-ux/project-notes
scope:
  - apps/console/src/modules/projects/**
  - apps/nest-api/src/modules/projects/**
  - apps/nest-api/src/database/**
  - apps/console/src/modules/chat/components/**
  - apps/console/src/modules/shell/components/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-26
---

## What

Implement a live Project Notes surface in Grid Console and back it with runner/database persistence.
When clicking "Add as note" on chat message bubbles or assistant responses, save the selected content
directly into the project's notes sheet.

## Why / Context

Chat bubbles and assistant responses now feature an "Add as note" action with a placeholder toast.
Turning this into a real feature allows users to collect critical agent recommendations, code snippets,
and architectural decisions into durable project notes.

## Outcome

- Notes live in the API next to tasks (`notes` table, migration 0006), not on the runner: they
  are project context, so they outlive any one machine or Codespace. Routes:
  `GET/POST /projects/:slug/notes`, `PATCH/DELETE /projects/:slug/notes/:id`.
- Console: a Notes page per project (`/notes/:slug`), reachable from the title bar views and the
  sidebar tree. Write, edit (Markdown with preview), copy and delete; actions on hover for
  pointers and long press on touch. Cached on the device like threads.
- "Add as note" on sent messages and agent answers (hover bar, and the long-press menu on touch).
  A note remembers the agent and chat it came from ("Claude in Plan the API") and links back.
- The card said a placeholder "Add as note" already existed; it did not, so it was added here.

## Validation

- `bun run typecheck`: all packages exited 0.
- `bun run lint`: exited 0 (only warnings already on main, in apps/web).
- `bun run architecture:check`: passed; naming OK (607 paths).
- apps/nest-api `bun run test`: 26 passed (3 new for notes).
- apps/console `vitest run`: 221 passed (notes-screen and transcript-view "Add as note" tests new).
