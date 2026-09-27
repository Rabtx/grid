---
id: str-sidebar-pages-and-freebuff-chat-file
title: Project pages once in the sidebar; Freebuff turns from its chat file
type: feature
from: human
to: ui-ux
priority: high
status: doing
assignee: ui-ux
reviewer: human
parent: none
depends_on: []
branch: agent/ui-ux/sidebar-and-freebuff
worktree: ../grid-worktrees/agent/ui-ux/sidebar-and-freebuff
scope:
  - apps/console/src/modules/shell/**
  - apps/console/src/modules/projects/context/workspace-context.tsx
  - apps/runner/src/agents/**
created: 2026-09-27
updated: 2026-09-27
---

## What

1. The sidebar lists Board, Files, Pull requests and Notes once, in its top group, for the project
   you are in; each page's title bar switches project. Projects in the tree show only threads.
2. Freebuff chats did not show replies reliably. The adapter now reads Freebuff's own chat file:
   it says exactly when a reply is complete and holds its exact text, and its folder name is the
   conversation id for resuming. It waits for the input box before typing, checks the message was
   taken, passes on connection trouble, and reports the CLI's own words when it stops.

## Validation

- Runner `bun test src/agents`: 49 pass (Freebuff: same words sent twice, a screen it cannot
  follow ending from the chat file, resuming by id, a crash reported in Freebuff's words).
- Console `vitest run`: 300 pass (new: the project switcher opens another project's same page).
- Browser on a cloned stack: the top group and switcher on desktop and phone.
- Live Freebuff: blocked; the installed Freebuff binary segfaults at start on this machine since
  its reboot (`freebuff --version` too), outside Grid.
