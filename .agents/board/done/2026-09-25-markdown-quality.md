---
id: str-markdown-quality
title: Markdown that reads well — agent replies and task descriptions
type: feature
from: human
to: ui-ux
priority: normal
status: done
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

- One renderer (`chat/lib/markdown.ts`) for agent replies and task descriptions: fenced code is
  highlighted with highlight.js core and 13 common languages (aliases such as ts, tsx, sh, html
  included), split into balanced lines (`splitLines`) so multi-line tokens keep their colour
  under the CSS line numbers; unknown languages stay plain. It ships only in the chat chunk and
  the lazily-loaded task preview. `copyCodeFrom` handles every code card's Copy button.
- `global.css` `.chat-prose`: heading scale, list markers, task lists with checkboxes in place of
  bullets, tables with a header row and zebra rows (scrolling inside themselves), blockquotes,
  rules, links, `<kbd>` (the only raw HTML kept), and wrapping of long inline code on phones.
  Syntax colours come from the theme's signal colours, so light and dark both hold.

Validation: console 162 tests (renderer tests for highlighting, balanced lines, task lists,
tables and key caps), typecheck and lint clean; screenshots of a Markdown sampler at 1440×900
and 390×844, no console errors.
