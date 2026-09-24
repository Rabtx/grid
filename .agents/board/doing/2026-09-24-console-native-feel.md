---
id: str-console-native-feel
title: Native feel on phones and desktop — touch defaults, swipeable sheets, route-aware chrome
type: feature
from: human
to: ui-ux
priority: high
status: doing
assignee: claude
reviewer: claude
parent: .agents/plans/console-design-migration.md (UX polish round)
depends_on: []
branch: agent/ui-ux/console-native-feel
worktree: ../grid-worktrees/agent/ui-ux/console-native-feel
port: 3040
scope:
  - packages/tokens/src/base.css
  - apps/console/src/ui/sheet.tsx
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

<Filled by the resolver.>
