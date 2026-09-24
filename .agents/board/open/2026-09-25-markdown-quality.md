---
id: str-markdown-quality
title: Markdown that reads well — agent replies and task descriptions
type: feature
from: human
to: ui-ux
priority: normal
status: open
assignee: claude
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: [str-project-board]
branch: agent/ui-ux/markdown-quality
worktree: ../grid-worktrees/agent/ui-ux/markdown-quality
scope:
  - apps/console/src/modules/chat/lib/markdown.ts
  - apps/console/src/modules/chat/lib/markdown.test.ts
  - apps/console/src/styles/global.css
  - apps/console/src/modules/projects/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

One Markdown renderer for chat and tasks with real typography: heading scale, lists and task
lists, tables, blockquotes, links, inline code, syntax-highlighted code blocks (a small,
lazily-loaded highlighter), and long content that never breaks the layout on a phone.

## Validation

Renderer tests; screenshots of a Markdown sampler at desktop and phone sizes.

## Resolution
