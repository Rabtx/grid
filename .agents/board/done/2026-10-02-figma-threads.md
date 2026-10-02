---
id: str-figma-threads
title: Threads match the Figma 09 Threads frames
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-home]
branch: agent/web/figma-threads
worktree: none
scope:
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/shell/**
  - apps/console/src/kit/**
  - apps/console/src/routes/app-shell.tsx
created: 2026-10-02
updated: 2026-10-02
---

## What

The thread list, the conversation and the new-thread screen rebuilt to Figma "09 Threads",
desktop and phone, light and dark.

## Scope

**Out of scope (no backend yet, so not drawn rather than faked):** "Review changes" button and the
tests badge in the run panel, thread participants beyond you and the agent. The phone thread
header keeps the menu button rather than Figma's back arrow (follow-up).

## Resolution

**Changed** — user messages as right-aligned bubbles with "you · time"; an agent header per turn;
work steps grouped in a collapsible WorkCard with tone glyphs, code chips and the highlight diff
shown once below it; approvals restyled (shield tile, Allow / Always / Deny), pending ones docked
above the composer; ThreadHeader (branch, machine, agent · model, started) and an xl run panel
(Run / Changes, from `threadFacts`); composer as a card with pill chips and round send/stop; new
thread header with project tile and suggestion pills; project tree with counts, chevrons, status
dots and a "New thread" row; header tabs as pills. The shell now reads the inbox list (not just
the count) so thread dots show what waits.

**Validation** — typecheck clean; lint 0 errors; 74 files / 486 tests; build OK; Chromium at
1440×900 and 390×844, light and dark, against a seeded local runner thread; no page errors.

**Review** — independent reviewer: several approvals at once, spinners stuck after a stop,
shimmer on finished turns, tab close unreachable by keyboard, nav shifting on hover, card open
default, the diff shown twice, empty steps, the add tile, an empty subtitle and the inbox list
not loaded. All fixed.
