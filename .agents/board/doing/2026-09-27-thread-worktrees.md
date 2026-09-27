---
id: str-thread-worktrees
title: A git worktree for every thread, by default
type: feature
from: human
to: backend
priority: high
status: doing
assignee: backend
reviewer: human
parent: none
depends_on: []
branch: agent/backend/thread-worktrees
worktree: ../grid-worktrees/agent/backend/thread-worktrees
scope:
  - apps/runner/src/chat/**
  - apps/runner/src/folders/routes.ts
  - apps/runner/src/server.test.ts
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/shell/components/**
created: 2026-09-27
updated: 2026-09-27
---

## What

Roadmap A1, first part. A new thread in a git project gets its own worktree
(`<projects>/.grid-worktrees/<repo>/chat-<id>`) on a branch `grid/chat-<id>` from what the project
has checked out; the agent works there. The composer shows the branch; the thread's menu removes
the worktree (keeping the branch by default, saying first what would be lost); deleting a thread
removes an unused worktree and keeps one holding work; each project's menu turns it off.

Also fixed: one project linked outside the projects folder made the runner's folder list fail
(403) for every project, which left the folder picker loading forever.

## Validation

- Runner `bun test`: 158 pass (6 new on real git repositories, 1 new folder list test).
- Console `vitest run`: 302 pass (2 new for the worktree dialog).
- Browser on a cloned stack with a scratch repository: a thread got `grid/chat-575a2ae1 from main`,
  the agent answered from the worktree, and "Remove worktree…" removed it and its branch.

## Next

- Settings → Worktrees: every worktree with its state, and safe clean-up of merged ones.
- "Fix with an agent" on a pull request: a thread in a worktree on the pull request's branch.
