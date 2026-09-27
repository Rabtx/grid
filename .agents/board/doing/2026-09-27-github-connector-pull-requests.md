---
id: str-github-connector-pull-requests
title: GitHub connector and pull requests
type: feature
from: human
to: backend
priority: high
status: doing
assignee: backend
reviewer: human
parent: none
depends_on: []
branch: agent/backend/github-connector
worktree: ../grid-worktrees/agent/backend/github-connector
scope:
  - apps/runner/src/github/**
  - apps/runner/src/main.ts
  - apps/runner/src/server.ts
  - apps/console/src/modules/github/**
  - apps/console/src/modules/environments/components/codespaces-panel.tsx
  - apps/console/src/modules/settings/**
  - apps/console/src/modules/shell/components/project-tree.tsx
  - apps/console/src/routes/app-shell.tsx
  - apps/console/src/app.tsx
created: 2026-09-27
updated: 2026-09-27
---

## What

Roadmap B1 and B2. Settings → Connectors shows GitHub (through the `gh` sign-in on the machine
Grid runs on, claimed by one person, as Codespaces already did). Every project gets Pull requests:
open, mine and to review; each opens to its state, review, checks, conversation and changed files,
with merge (squash, merge commit, rebase, after a confirm), ready or draft, close, and comments.

## Acceptance

- [x] Connectors page with GitHub connect and disconnect; the sign-in is shared with Codespaces.
- [x] A project's pull requests come from its folder's `origin`, through the project's machine.
- [x] List with filters; detail with badges, merge box, conversation, checks and files.
- [x] Merge asks first; only the person who connected GitHub can use it.
- [x] Phones: the pull request covers the list, with a way back.

## Validation

- Runner `bun test`: 144 pass (10 new for pull requests, with a fake `gh`).
- Console `vitest run`: 299 pass (6 new). Lint, typecheck and architecture checks clean.
- Live on a cloned stack: Connectors showed the connected account; the Grid project's list (no
  open pull requests) and #122 (merged) with its checks and 16 changed files, on desktop and phone.
  Nothing was merged or commented on the real repository.

## Follow-ups

- "Fix with an agent": a thread on the pull request's branch, once threads get worktrees (A1).
- Inline review comments on lines of the diff.
