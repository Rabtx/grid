---
id: str-console-native-feel
title: Native feel on phones and desktop — touch defaults, swipeable sheets, route-aware chrome
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: claude
parent: .agents/plans/console-design-migration.md (UX polish round)
depends_on: []
branch: agent/ui-ux/console-native-feel
worktree: ../grid-worktrees/agent/ui-ux/console-native-feel
port: 3040
scope:
  - apps/console/src/styles/global.css
  - apps/console/src/ui/sheet.tsx
  - apps/console/src/ui/swipe.ts
  - apps/console/src/ui/swipe.test.ts
  - apps/console/src/routes/app-shell.tsx
  - apps/console/src/routes/app-shell.test.tsx
  - apps/console/src/modules/shell/components/offline-banner.tsx
  - apps/console/src/modules/shell/index.ts
  - apps/console/src/modules/shell/components/top-bar.tsx
  - apps/console/src/modules/shell/components/nav-drawer.tsx
  - apps/console/src/modules/projects/context/workspace-context.tsx
  - apps/console/src/pwa/**
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

The human's ask: the console should feel smooth and native everywhere, never awkward on a phone
or a desktop. This card is the heavy, cross-cutting part; the scoped parts are separate cards
(session keep-alive, touch targets, toasts, keyboard shortcuts, sign-in polish).

## Proposal

1. Touch defaults: no grey tap flash, no double-tap zoom delay (`touch-action: manipulation`),
   no rubber-band overscroll of the whole app in the installed PWA, no text selection on chrome
   controls — without hurting focus rings or text selection in content.
2. Sheets follow the finger: drag a bottom sheet or the task panel down to dismiss, the nav
   drawer left to close, with the sheet easing and reduced-motion respected.
3. Route-aware phone top bar: the title says where you are (project, Terminal, Settings) and the
   "+" only shows where it does something.
4. Fresh data on resume: the board re-reads tasks when the app comes back to the foreground.
5. Offline awareness: a quiet banner when the network is gone, gone when it is back.

## Validation

Console test/typecheck/build, root lint/format/architecture; manual checks at 375 px (touch
emulation) and 1280 px.

## Resolution

### What changed

1. **Touch defaults** (`styles/global.css`, console only — the shared `packages/tokens/base.css`
   also serves the marketing site, so it was left alone): no tap highlight, `touch-action:
   manipulation` on controls (no double-tap zoom delay), no callout/selection on buttons, tabs and
   nav links, and `overscroll-behavior: none` in the installed app (no bounce or pull-to-refresh).
2. **Swipe to dismiss** (`ui/sheet.tsx`, logic in `ui/swipe.ts` + tests): bottom sheets and the
   phone task panel follow the finger down, the nav drawer left. Dismisses past a third of the
   sheet or on a flick; pulling back cancels; the other way stretches a little and resists. The
   gesture yields to inputs, `[data-no-swipe]`, and content that is scrolled away from its start.
   A grabber shows on touch screens. Desktop is unchanged.
3. **Route-aware phone top bar**: titled Terminal / Settings off the board, with the "+" only on
   the board (a spacer keeps the title centred).
4. **Fresh on resume**: the board re-reads tasks when the app returns after 30 s+ hidden, or when
   the network comes back.
5. **Offline banner**: a quiet pill while `navigator.onLine` is false.

### Validation output

```text
$ bunx vitest run      # apps/console
      Tests  88 passed (88)
$ bun run typecheck    # clean
$ bunx oxlint .        # clean
```

Touch check — Chromium at 375×740, `hasTouch`, real CDP touch events on `/dev/ui`:

```text
tap-highlight: rgba(0, 0, 0, 0)
button touch-action: manipulation
bottom sheet open: true grabber visible: true
after short slow pull, still open: true
after long pull, open: false
panel open: Example panel
after flick, panel open: false
```
