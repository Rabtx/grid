---
id: str-diff-viewer
title: Rich syntax-highlighted diff viewer for tool calls in transcript
type: feature
from: human
to: ui-ux
priority: normal
status: backlog
assignee: ui-ux
reviewer: human
parent: .agents/plans/agent-chat.md
depends_on: []
branch: none
worktree: none
scope:
  - apps/console/src/modules/chat/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Render unified/split syntax-highlighted diffs inside expanded file `edit` tool rows in the chat transcript.
Show green additions and red deletions instead of raw patch strings.

## Why / Context

When agents edit files, reviewing the diff is currently done by reading raw patch inputs.
A clean syntax-highlighted diff viewer gives users confidence before accepting edits.
