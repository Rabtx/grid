---
id: web-home-and-scroll-fixes
title: Home X-axis flow, overflow scrolling, global hidden scrollbars, and chat scroll rail
type: bug
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/home-and-scroll-fixes
worktree: /home/ghost/Projects/grid-worktrees/agent/web/home-and-scroll-fixes
scope:
  - apps/console/**
allowed_shared:
  - .agents/board/**
created: 2026-10-06
updated: 2026-10-06
---

## What

1. Remove the excessive X-axis padding/margin gap in Home (`Today` and `Pulse`) so it flows naturally edge-to-edge with the rest of the application screens (`px-4 md:px-6`). Include `/home` in `FULL_BLEED` routes so `AppFrame` does not double-wrap or constrain its canvas.
2. Fix scrolling on Home (`Today` and `Pulse`) so it properly scrolls within its bounded viewport without overflowing the area.
3. Turn off ugly native grey scrollbars application-wide by default in `global.css` while maintaining smooth wheel, trackpad, touch, and keyboard scrolling.
4. Add a sleek interactive scroll rail ("grill") with tactile grip styling to the chat conversation viewport, providing smooth scroll positioning, track clicking, dragging, and quick scroll-to-bottom affordance.

## Why / Context

The user observed that Home (`Today` and `Pulse`) had an excessive horizontal gap, isolated width constraint (`max-w-6xl`), and broken/missing scrolling due to non-bleed layout wrapping. Additionally, native browser scrollbars look clunky and distracting across the console and composer, whereas the chat requires a refined, tactile scroll rail/grill affordance.

## Scope

**In scope:**
- `apps/console/src/styles/global.css`
- `apps/console/src/routes/app-shell.tsx`
- `apps/console/src/modules/home/components/home-screen.tsx`
- `apps/console/src/modules/home/components/pulse-screen.tsx`
- `apps/console/src/modules/chat/components/conversation.tsx`
- `apps/console/src/kit/**`

**Out of scope:**
- Backend API, runner, launcher, database schemas.

## Validation

- `bun --cwd=apps/console run test`: 114 test files passed, 641 tests passed (100% pass rate).
- `bun --cwd=apps/console run lint`: 0 errors.
- `bun --cwd=apps/console run typecheck`: 0 errors.
- `bun run architecture:check`: Passed.
- `bun run naming:check`: OK (883 paths checked).
- `bun run lint && bun run format && bun run typecheck`: Clean across monorepo.

## Resolution

- In `apps/console/src/styles/global.css`, suppressed default browser scrollbars globally (`scrollbar-width: none; -ms-overflow-style: none; *::-webkit-scrollbar { display: none; }`) while preserving natural wheel, touch, and keyboard scrolling.
- In `apps/console/src/routes/app-shell.tsx`, added `home` to `FULL_BLEED` route list so `AppFrame` delegates layout flow and scrolling directly to the screen view instead of adding outer nested overflow and artificial gutters.
- In `apps/console/src/modules/home/components/home-screen.tsx` and `pulse-screen.tsx`, eliminated the `max-w-6xl mx-auto px-10` gap constraint, flowing cleanly with standard screen edge padding (`px-4 md:px-6`) and smooth internal scrolling.
- In `apps/console/src/kit/scroll-rail.tsx`, created the `ScrollRail` kit component with tactile grip ridges, smooth draggable thumb, track jump clicking, pointer capture, and auto-dimming.
- In `apps/console/src/modules/chat/components/conversation.tsx`, mounted `<ScrollRail>` alongside a kit `<Button>` "Latest" pill affordance to immediately jump down when unpinned.
