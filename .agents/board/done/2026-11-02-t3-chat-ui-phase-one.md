---
id: str-t3-chat-ui-phase-one
title: chat transcript on t3 code's minimap and work log (phase one of the t3 chat ui)
type: feature
from: human
to: web
priority: normal
status: done
assignee: web
reviewer: ui-ux
parent: none
depends_on: []
branch: ccr-d4ce2b6f-zgf6aj
worktree: none
scope:
  - apps/console/src/kit/**
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/tour/content.tsx
allowed_shared:
  - packages/tokens/src/kit.css
  - DESIGN.md
  - THIRD-PARTY-NOTICES.md
created: 2026-11-02
updated: 2026-11-02
---

## What

Rebuild the chat transcript on T3 Code's approach (MIT): its timeline minimap in place of the
message rail, and its work log in place of the tool-call cards, for tool runs, single calls,
thoughts, subagents and background commands.

## Why / Context

The human asked for T3 Code's chat UI across the whole chat: the scroll ladder, the tool-call,
search, edit and subagent responses, the composer and the info card. This card is phase one, the
transcript; the composer and info card follow as phase two.

## Proposal or Ask

- `kit/timeline-minimap.tsx`: left-gutter ladder, fisheye, preview card, arrows, keyboard, wheel.
- `kit/work-log.tsx` + `modules/chat/lib/work-log.ts`: 24px lines and T3's summary wording.
- Remove `MessageRail`, `WorkCard`, `WorkStep`, `BackgroundRow`, `BackgroundList` and the old
  summary helpers once nothing uses them.

## Scope

**In scope:** the paths above. **Out of scope:** the composer and the thread info card (phase two).

## Validation

- `bunx tsc --noEmit` in apps/console: clean
- `bunx vitest run` in apps/console: 149 files, 809 tests passed
- oxlint on the changed files: clean; `naming:check` OK
- Playwright against the Vite dev server: a 7-turn thread at 1280px and 390px; groups, an edit's
  diff, a subagent and the minimap preview opened; the live call shines; no page errors

## Resolution

Landed on `ccr-d4ce2b6f-zgf6aj`. T3 Code's MIT notice is in `THIRD-PARTY-NOTICES.md`.
