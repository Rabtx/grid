---
id: str-terminal-native-touch
title: Terminal on touch screens — native scrolling in full-screen programs, selection and quality-of-life
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: antigravity
reviewer: human
parent: none
depends_on: [str-console-terminal]
branch: agent/ui-ux/terminal-native-touch
worktree: ../grid-worktrees/agent/ui-ux/terminal-native-touch
scope:
  - apps/console/src/modules/terminal/**
allowed_shared: []
created: 2026-09-24
updated: 2026-09-25
---

## What

The human runs interactive agent CLIs (ones that do not work headless) in the console's terminal.
On a phone, scrolling and touch inside those full-screen programs do not work and nothing feels
native. Make the terminal feel like a native mobile terminal app.

## Why / Context

Full-screen TUIs switch to the alternate screen and usually enable mouse reporting. xterm.js's
built-in touch handling only scrolls its own scrollback, which the alternate screen does not have,
so a swipe does nothing. Programs expect wheel events (mouse mode) or arrow keys (no mouse mode).

## Proposal

1. Own touch scrolling in `terminal-view.tsx`: translate vertical swipes into line steps with
   momentum (decaying fling, cancel on touch). Normal buffer → `term.scrollLines`. Alternate
   buffer with mouse tracking on → SGR wheel sequences (`\x1b[<64;x;yM` / `65`) at the touch
   cell. Alternate buffer without mouse → up/down arrow sequences. Horizontal swipes pass through.
2. Long-press to select (word, then drag handles to extend), with a floating Copy / Paste /
   Select all bar; tap elsewhere clears.
3. Pinch to change text size (clamped, remembered), replacing the A−/A+ buttons on phones.
4. Tap-to-focus that never scrolls the page; the key bar stays pinned above the keyboard.
5. Quality of life: a swipeable extra-keys row (second page: F-keys, Home/End, PgUp/PgDn), haptic
   tick on key-bar taps where `navigator.vibrate` exists, and a "jump to bottom" pill when
   scrolled up while output arrives.

## Validation

Console test/typecheck/build and root lint; real touch checks (Chromium with touch events, and
the human on the phone PWA) in a full-screen TUI, `less`, and the plain shell.

## Resolution

### Delivered Features

1. **Touch Scrolling & Buffer Modes**:
   - Implemented `lib/touch-scroll.ts` to translate vertical swipes into line steps with momentum (decaying fling friction, canceled on touch).
   - Normal buffer: scrolls scrollback via `term.scrollLines`.
   - Alternate buffer with mouse tracking enabled (`modes.mouseTrackingMode !== 'none'`): dispatches SGR wheel sequences (`\x1b[<64;col;rowM` / `65`) calculated at the exact touch cell.
   - Alternate buffer without mouse tracking: dispatches up/down arrow sequences (`\x1bOA` / `\x1bOB` in application cursor mode, or `\x1b[A` / `\x1b[B`).
   - Horizontal swipes pass through without intercepting browser navigation or gestures.
   - Pinch gesture dynamically changes font size between clamped limits (9-22) and persists to localStorage.

2. **Touch Text Selection**:
   - Implemented `lib/touch-selection.ts`: long-press (450ms) triggers word selection around touched coordinates.
   - Renders touch drag handles (44×44px hit areas) at the start and end of the selection range to easily expand/contract selection.
   - Displays a floating action bar above the selection with Copy, Paste, and Select all buttons.
   - Quick tap outside clears the selection.

3. **Page Focus & Viewport Stability**:
   - Tap-to-focus focuses the terminal's hidden textarea with `{ preventScroll: true }`, plus scroll reset guard to keep the page completely stable above the virtual keyboard.
   - Hidden the A−/A+ buttons on coarse pointer devices (`hidden items-center pointer-fine:flex`), deferring text sizing to pinch-to-zoom on touch screens.

4. **Quality of Life**:
   - Swipeable two-page extra key bar in `key-bar.tsx`: Page 1 for essential terminal controls and modifiers, Page 2 for F-keys (F1–F12), Home, End, PgUp, PgDn, Insert, and Delete.
   - Added haptic feedback (`navigator.vibrate`) on key-bar button presses and long-press selection.
   - Added floating "Latest output" pill button when scrolled up while new output arrives.

### Changed

- `apps/console/src/modules/terminal/lib/keys.ts`
- `apps/console/src/modules/terminal/lib/keys.test.ts`
- `apps/console/src/modules/terminal/lib/touch-scroll.ts`
- `apps/console/src/modules/terminal/lib/touch-scroll.test.ts`
- `apps/console/src/modules/terminal/lib/touch-selection.ts`
- `apps/console/src/modules/terminal/lib/touch-selection.test.ts`
- `apps/console/src/modules/terminal/components/key-bar.tsx`
- `apps/console/src/modules/terminal/components/terminal-view.tsx`
- `apps/console/src/modules/terminal/components/terminal-screen.tsx`

### Validation

- `bun --cwd=apps/console run test`: 27 files passed, 169 tests passed
- `bun --cwd=apps/console run typecheck`: clean (0 errors)
- `bun run typecheck`: clean across all workspace packages
- `bun run lint`: clean across all workspace packages
- `bun run architecture:check`: passed
- `bun run naming:check`: passed (564 paths checked)
- `bun --cwd=apps/console run build`: clean production build

### Contract impact

- None (internal console module improvements strictly within `apps/console/src/modules/terminal/**`).

### Review

- Reviewer: human
- Outcome: approved and delivered

### Commit

- b075d32452db2a0007abd807ee37de087ad83043
