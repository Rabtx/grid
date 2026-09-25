---
id: str-diff-viewer
title: Rich syntax-highlighted diff viewer for tool calls in transcript
type: feature
from: human
to: ui-ux
priority: normal
status: done
assignee: ui-ux
reviewer: human
parent: .agents/plans/agent-chat.md
depends_on: []
branch: agent/ui-ux/diff-viewer
worktree: ../grid-worktrees/agent/ui-ux/diff-viewer
scope:
  - apps/console/src/modules/chat/**
  - apps/runner/src/agents/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-26
---

## What

Render unified/split syntax-highlighted diffs inside expanded file `edit` tool rows in the chat transcript.
Show green additions and red deletions instead of raw patch strings.

## Why / Context

When agents edit files, reviewing the diff is currently done by reading raw patch inputs.
A clean syntax-highlighted diff viewer gives users confidence before accepting edits.

## Outcome

- The card assumed raw patches already reached the console; they did not (edit rows carried only
  a path). The runner now attaches `diffs` (unified hunks plus added/removed counts) to edit tool
  events from every agent: Claude's Edit/MultiEdit/Write input, ACP `diff` content (opencode and
  other ACP agents) and Codex file changes. A small built-in Myers line diff does this; no new
  dependency. Very large or wholesale-rewritten files keep only their counts.
- Console: an expanded edit row shows each file as a diff: path, +N −M, numbered lines (old and
  new numbers from `sm`, one column on phones), additions green, deletions red, syntax highlighted
  by file extension with each hunk side highlighted as a whole so multi-line strings and comments
  colour correctly. Long diffs open at 80 rows with "Show all". The collapsed row shows +N −M.
- Unified view only: it reads the same on a phone and a desktop. A split view can follow if wanted.

## Validation

- `bun run typecheck`: all packages exited 0.
- `bun run lint`: exited 0; no new warnings.
- `bun run architecture:check`: passed; naming OK (610 paths).
- apps/runner `bun test`: 103 passed (10 new in agents/diff.test.ts).
- apps/console `vitest run`: 226 passed (diff rows and transcript diff tests new).
