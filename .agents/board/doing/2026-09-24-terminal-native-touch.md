---
id: str-terminal-native-touch
title: Terminal on touch screens — native scrolling in full-screen programs, selection and quality-of-life
type: feature
from: human
to: ui-ux
priority: high
status: open
assignee: none
reviewer: claude
parent: none
depends_on: [str-console-terminal]
branch: agent/ui-ux/terminal-native-touch
worktree: ../grid-worktrees/agent/ui-ux/terminal-native-touch
scope:
  - apps/console/src/modules/terminal/**
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
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

<Filled by the resolver.>
