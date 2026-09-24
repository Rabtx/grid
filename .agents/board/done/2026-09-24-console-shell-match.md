---
id: str-console-shell-match
title: Console shell matches the design reference — sidebar, workspace panel, title bar, status bar
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: [str-project-folders]
branch: agent/ui-ux/console-shell-match
worktree: ../grid-worktrees/agent/ui-ux/console-shell-match
scope:
  - apps/console/src/routes/app-shell.tsx
  - apps/console/src/modules/shell/**
  - apps/console/src/modules/chat/components/chat-screen.tsx
  - apps/console/src/modules/chat/components/session-list.tsx
  - apps/console/src/ui/**
  - apps/console/src/modules/terminal/components/terminal-screen.tsx
  - apps/console/src/modules/voice/components/voice-controls.tsx
  - apps/console/src/modules/settings/components/appearance-screen.tsx
  - apps/console/src/modules/projects/components/project-sheets.tsx
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Rebuild the signed-in shell to match the design reference screenshots in
`~/.local/share/grid/design-ref/` (outside the repo): a three-pane desktop layout and a
single-pane phone layout with a drawer.

## Proposal

Desktop (`lg:`):

- **Primary sidebar, 200px, glass, `border-r border-stroke`.** 40px top row with back/forward
  and a collapse toggle (26px icon buttons, ink/25 when disabled). Search button (32px, 1px
  ink/8 border, "Ctrl+K" hint) opening the command palette. Nav rows 32px, `text-sm font-medium`,
  ink/50 → ink on hover/active: Board, Chat, Terminal. "Projects" caption (sentence case,
  `text-xs` ink/50) with a 20px `+`. Project rows 32px with a 16px project mark, active row on
  `bg-selection-strong`. Footer: Settings row with "Ctrl+," hint; account moves into Settings.
- **Workspace panel, 260px**, shown for project sections. 40px header "<Project>" with search and
  new-session buttons; 36px segmented tabs (Sessions / Terminals); 36px filter row
  ("Search conversations…"); session cards (provider mark + model at 11px ink/50, age at right,
  13px semibold title clamped to one line, folder/branch line at 11px ink/45, hover archive).
- **Title bar, 40px, `border-b border-stroke`:** open session tabs on the left (provider mark +
  title, active on `bg-selection`), centred muted title `<project> — Grid` at 11.5px ink/40.
- **Status bar, 28px, `border-t border-stroke`, 11px ink/55:** connection state on the left,
  "Terminal" toggle on the right.
- Chat empty state: `text-lg` heading "What should we work on in <project>?" above the composer,
  both in a centred `max-w-3xl` column; transcript and composer at `max-w-4xl`.

Phone: 56px top bar with a menu button, the current session tab and the muted title; the drawer
stacks the sidebar over the workspace panel (as in `phone-menu.png`); status bar pinned to the
bottom. Chat opens straight on a new session instead of the session list.

## Scope

**In scope:** paths listed above.

**Out of scope:** composer and pickers (str-chat-composer-match), transcript
(str-chat-transcript-match), board internals.

## Validation

Console test/typecheck/build, root lint/format/architecture; Playwright screenshots at 1440×900
and 390×844 next to the reference, no console errors.

## Resolution

Landed on `agent/ui-ux/console-shell-match`.

- New shell (`routes/app-shell.tsx`, `modules/shell/**`): 200px glass sidebar (brand, back/forward,
  fold, Search with Ctrl+K, Board/Chat/Terminal, Projects with `+`, Settings with Ctrl+,), a
  260px workspace panel, a 40px title bar and a 28px status bar (project folder, Terminal). The
  frame is sized to the visual viewport, so every screen stays above the phone keyboard.
- Screens hand parts of themselves to the shell through `ShellSlot` (`panel`, `tabs`).
- Chat: the project's chats are the workspace panel (`session-list.tsx`: filter, cards with agent
  and model, age, title, folder); open chats are closable tabs in the title bar, remembered per
  project; `/chat/<project>` opens the new-chat composer; the new-chat heading is plain as in
  the reference.
- Phones: top bar with menu and the current tab; the drawer stacks the sidebar over the panel.
- Command palette (`command-palette.tsx`): sections, projects and actions.
- Terminal and chat dropped their own viewport fitting; account and Sign out moved to Settings;
  the floating mic clears the status bar; the Add project folder browser mounts only when open.
- Deferred: Sessions/Explorer panel tabs, pinned chats and git branch lines (no data for them
  yet).

Validation: console 147 tests pass, typecheck and lint clean; Playwright at 1440×900 and 390×844
(chat, conversation, board, settings, terminal, drawer, palette) with no console errors or strict
warnings; the add-project flow re-checked on both sizes.
