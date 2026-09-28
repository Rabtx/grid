---
id: str-composer-git-control
title: Git control in the composer; worktrees chosen, not automatic; Settings → Worktrees
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: ui-ux
reviewer: human
parent: none
depends_on: []
branch: agent/ui-ux/composer-git
worktree: ../grid-worktrees/agent/ui-ux/composer-git
scope:
  - apps/runner/src/chat/**
  - apps/runner/src/folders/**
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/settings/**
  - apps/console/src/modules/shell/components/**
  - apps/console/src/kit/button.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/app.tsx
created: 2026-09-27
updated: 2026-09-28
---

## What

Human feedback on A1: do not make a worktree for every new thread; put git under the composer.
The branch control beside the folder switches or creates a branch in that folder; before a
thread's first message it also offers "New worktree" on a branch you name (made when you send).
Settings → Worktrees lists every worktree by project with what removing it would lose, removes
one safely, and cleans up those that hold nothing. Worktrees are off by default; a project can
still start every thread in one from its menu.

## Validation

- Runner `bun test`: 161 pass (git info and checkout; named worktree branches; leftovers listed
  and removed; clean-up of only what holds nothing).
- Console `vitest run`: 304 pass (git control: switching, creating, choosing a new worktree).
- Browser on a cloned stack with a scratch repository: the control, its menu and the page.

## Resolution

Merged to `main` as #127; the board was brought up to date on 2026-09-28.
