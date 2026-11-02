---
id: str-t3-chat-ui-phase-four
title: finished turns fold their work, visuals open full screen (phase four of the t3 chat ui)
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

The last phase of the T3 chat UI: a finished turn folds its work under one "Worked for …" line
with its reply open; an agent's HTML page gets T3's "Open full screen"; "Scroll to end" is a pill
centred over the thread's end.

## Why / Context

Phase four of the human's ask (#269 transcript, #270 composer, #271 details card), including a
look at the rich visuals.

## Proposal or Ask

- `TurnFold` (kit/run.tsx) and the fold in `TurnView`; `STAYS_OPEN` keeps visuals, plans,
  checkpoints, notices, steers, dividers and answered approvals and questions open.
- `VisualFrame`: a hover toolbar with "Open full screen" into a dialog.
- Audit: user bubbles, dividers and the inline visual already match T3's; no change needed.

## Scope

**In scope:** the paths above.

## Validation

- `bunx tsc --noEmit` in apps/console: clean; oxlint on the changed files: clean
- `bunx vitest run` in apps/console: 150 files, 813 tests passed (a new fold test)
- `bunx playwright test` in apps/console: 14 passed
- Playwright screenshots: folded, unfolded and live turns; the visual's hover action and its
  full-screen dialog; no page errors

## Resolution

Landed on `ccr-d4ce2b6f-zgf6aj`; merged to main by squash.
