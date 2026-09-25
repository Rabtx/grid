---
id: str-composer-file-mentions
title: File mentions with @ autocomplete in chat composer
type: feature
from: human
to: web
priority: normal
status: doing
assignee: web
reviewer: human
parent: .agents/plans/agent-chat.md
depends_on: []
branch: agent/web/composer-file-mentions
worktree: ../grid-worktrees/agent/web/composer-file-mentions
scope:
  - apps/console/src/modules/chat/**
  - apps/runner/src/folders/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-26
---

## What

Allow users to type `@` in the chat composer to open an autocomplete popup listing files in the project
folder. Selecting a file attaches or injects the relative path into the prompt with context.

## Why / Context

Typing absolute or relative file paths by hand is error prone. Autocomplete powered by the runner's
folder indexing makes directing agents to specific files frictionless on phone and desktop.
