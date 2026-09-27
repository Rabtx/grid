---
id: str-fix-with-an-agent
title: "Fix with an agent" on a pull request
type: feature
from: human
to: backend
priority: high
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: agent/backend/fix-with-an-agent
worktree: ../grid-worktrees/agent/backend/fix-with-an-agent
scope:
  - apps/console/src/modules/github/**
  - apps/console/src/modules/chat/**
  - apps/runner/src/github/**
  - apps/runner/src/chat/**
created: 2026-09-28
updated: 2026-09-28
---

## What

Roadmap B2's last piece. A "Fix with an agent" action on a pull request (Pull requests page) that
starts a thread in a worktree on that pull request's branch, primed with what needs fixing.

## Why / Context

Pull requests with failing checks or review comments are the most common "go fix this". The
pieces exist: pull requests (`modules/github`, runner `github/pulls.ts`), threads in worktrees
(`runner/src/chat/worktrees.ts`, `ChatHub.create({ worktree, branch })`), the composer's git
control. Worktrees are chosen, never automatic — this action is an explicit choice to make one.

## Proposal or Ask

- **Button** in the pull request's detail (merge box area): "Fix with an agent", with a short
  sheet to pick the agent/model (reuse the model picker) and what to include: failing checks,
  review comments and unresolved comments, the description; editable first message.
- **Worktree on the existing branch:** extend `createWorktree` to check out an existing branch
  (fetch it from the remote when only the remote has it) instead of creating one; a branch
  already checked out elsewhere gets a clear error (git refuses two worktrees on one branch).
  Forks: fetch the pull request ref (`pull/<n>/head`) onto a local branch.
- **Priming:** the first message lists the failing checks (name, workflow, link; the failing
  log's last lines via `gh run view --log-failed` when available, trimmed) and the review
  comments (author, file:line when inline, body), then asks the agent to fix them on this branch,
  run the checks it can, commit, and push to the pull request's branch when asked.
- After starting, go to the new thread; the pull request shows a link to the threads fixing it.

Definition of done: on a pull request with a failing check, one click (plus the sheet) opens a
thread working in a worktree on its branch with the failure in its first message.

## Scope

**In scope:** the github module (console and runner), the chat module and hub/worktrees.

**Out of scope:** automations that do this on their own (Phase C), pushing without being asked.

## Validation

- Runner tests on real temporary git repositories: worktree on an existing local branch, on a
  remote-only branch, the "already checked out" refusal; the priming text from fixture `gh` JSON.
- Console tests: the button and sheet, the thread it starts.
- `bun run lint`, `bun run typecheck`, kit guard.

## Resolution
