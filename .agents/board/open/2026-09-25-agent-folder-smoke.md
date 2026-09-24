---
id: str-agent-folder-smoke
title: Prove every agent works in the project folder, with a repeatable smoke check
type: chore
from: human
to: ui-ux
priority: high
status: open
assignee: claude
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: [str-codex-adapter]
branch: agent/ui-ux/agent-folder-smoke
worktree: ../grid-worktrees/agent/ui-ux/agent-folder-smoke
scope:
  - apps/runner/scripts/**
  - apps/runner/package.json
  - apps/runner/src/agents/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

A script (`bun --cwd=apps/runner run smoke`) that, for each installed agent, starts a thread
through the hub in a fresh temp project folder, asks it to create a file, resumes the thread and
asks it to change the file, and checks both happened in that folder. Fix whatever it finds.

## Validation

The script's real output for every installed agent, on the card.

## Resolution
