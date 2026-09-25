---
id: str-composer-file-mentions
title: File mentions with @ autocomplete in chat composer
type: feature
from: human
to: web
priority: normal
status: backlog
assignee: web
reviewer: human
parent: .agents/plans/agent-chat.md
depends_on: []
branch: none
worktree: none
scope:
  - apps/console/src/modules/chat/components/composer.tsx
  - apps/console/src/modules/chat/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Allow users to type `@` in the chat composer to open an autocomplete popup listing files in the project
folder. Selecting a file attaches or injects the relative path into the prompt with context.

## Why / Context

Typing absolute or relative file paths by hand is error prone. Autocomplete powered by the runner's
folder indexing makes directing agents to specific files frictionless on phone and desktop.
