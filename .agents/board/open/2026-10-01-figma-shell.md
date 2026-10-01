---
id: str-figma-shell
title: Console shell matches the Figma rail, panel, top bar and mobile dock
type: feature
from: human
to: web
priority: high
status: open
assignee: none
reviewer: none
parent: none
depends_on: [str-figma-foundation]
branch: none
worktree: none
scope:
  - apps/console/src/modules/shell/**
created: 2026-10-01
updated: 2026-10-01
---

## What

Replace the single labeled sidebar with the Figma shell: an icon rail (Home, Inbox, Threads,
Board, Files, Notes, Terminal, Browser, PRs, Ship, Automations; Machines, Agents, Settings,
Account at the foot), a contextual panel beside it, a top bar with breadcrumb, and on phones a
header, drawer and a bottom dock that hugs its content with 8px padding.

## Why / Context

Second card of the human's request to replace the console UI with the Figma design exactly
(file `Dx4ZZ1v693wRzVDKzunhQA`). Rail items without a backend yet are left out, not faked.

## Validation

- Console typecheck, lint, tests, build; screenshots at 1440 and 390, light and dark.

## Resolution
