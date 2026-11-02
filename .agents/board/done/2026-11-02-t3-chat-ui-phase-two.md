---
id: str-t3-chat-ui-phase-two
title: composer on t3 code's attached banners and quiet toolbar (phase two of the t3 chat ui)
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
  - apps/console/src/modules/tour/content.tsx
allowed_shared:
  - DESIGN.md
  - THIRD-PARTY-NOTICES.md
created: 2026-11-02
updated: 2026-11-02
---

## What

The composer on T3 Code's approach: what waits on it (approvals, questions, guests' requests, a
limit wait, the goal, subagents, the queue) attached above the card as one banner strip, and a
quiet toolbar with a round ink send button and the model on the right.

## Why / Context

Phase two of the human's ask for T3 Code's whole chat UI. Phase one (transcript) is #269.

## Proposal or Ask

- `kit/composer-banner.tsx`: `ComposerBanners` (attached or detached) and `ComposerBannerRow`.
- `GoalBar`, `LimitWaitBar`, `SubagentStrip`, `QueueList` as banner rows; `QuestionCard`,
  `DecisionCard`/`ApprovalCard` and `GuestRequestCard` take `embedded` for the drawer.
- `PromptBox` takes `banners`; toolbar tools quiet, send round ink.

## Scope

**In scope:** the paths above. **Out of scope:** the thread info card (phase three), messages
and turn chrome (phase four).

## Validation

- `bunx tsc --noEmit` in apps/console: clean; oxlint on the changed files: clean
- `bunx vitest run` in apps/console: 149 files, 810 tests passed
- `bunx playwright test` in apps/console: 14 passed
- Playwright screenshots of PromptBox with every banner, dark, light and 390px: no page errors

## Resolution

Landed on `ccr-d4ce2b6f-zgf6aj`; merged to main by squash.
