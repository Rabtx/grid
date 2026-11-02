---
id: str-t3-chat-ui-phase-three
title: thread details on t3 code's details card (phase three of the t3 chat ui)
type: feature
from: human
to: web
priority: normal
status: done
assignee: web
reviewer: ui-ux
parent: str-t3-chat-ui-phase-one
depends_on: []
branch: ccr-d4ce2b6f-zgf6aj
worktree: none
scope:
  - apps/console/src/kit/**
  - apps/console/src/modules/chat/**
allowed_shared:
  - DESIGN.md
  - THIRD-PARTY-NOTICES.md
created: 2026-11-02
updated: 2026-11-02
---

## What

The thread's Run panel and the header's line of facts become one T3-style details card: Agent,
Workspace, Changes, Usage and Related sections of quiet rows.

## Why / Context

Phase three of the human's ask for T3 Code's whole chat UI (#269 transcript, #270 composer).

## Proposal or Ask

- `kit/thread-details.tsx`: `ThreadDetailsCard`, `ThreadDetailsSection`, `ThreadDetailsRow`.
- `modules/chat/components/thread-details.tsx`: the card's content and its popover button.
- Beside the thread from `xl` when not split; the desktop header's button (and a button at the top
  of the thread on phones) opens it otherwise. `DetailAside` and `FactGroup` are removed.

## Scope

**In scope:** the paths above. **Out of scope:** messages and turn chrome (phase four).

## Validation

- `bunx tsc --noEmit` in apps/console: clean; oxlint on the changed files: clean
- `bunx vitest run` in apps/console: 150 files, 812 tests passed
- `bunx playwright test` in apps/console: 14 passed
- Playwright screenshots of the card (dark, light) and its phone sheet: no page errors

## Resolution

Landed on `ccr-d4ce2b6f-zgf6aj`; merged to main by squash.
