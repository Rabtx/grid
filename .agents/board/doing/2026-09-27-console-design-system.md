---
id: str-console-design-system
title: Console rewrite on a design system taken from the references
type: feature
from: human
to: web
priority: high
status: doing
assignee: web
reviewer: human
parent: none
depends_on: []
branch: agent/frontend/design-system-kit
worktree: ../grid-worktrees/kit
scope:
  - apps/console/**
  - packages/tokens/**
  - DESIGN.md
allowed_shared: []
created: 2026-09-27
updated: 2026-09-27
---

## What

An end-to-end UI/UX rewrite of the console. First a design system (`src/kit`, `kit.css`) taken
closely from the reference designs and shown at `/design`, approved by the human; then every
screen rebuilt on it (shell, home and composer, chat and work panel, board, files and notes,
terminal, settings, sign-in and onboarding, members), deleting `@/ui` as screens move.

## Why / Context

The first redesign pass restyled existing screens and did not land. The human chose: follow the
references very closely, Inter, fix look and feel and navigation/layout, gallery first.

## Progress

1. **Kit and gallery (this branch).** Tokens, Inter, 20 component families, `/design` with an
   app preview, light and dark, phone and desktop. Awaiting the human's review.

2. **Hardened kit.** Tweak knobs (roundness, spacing, lines) on top of the tint, saved per
   device; named surface, ring and shadow utilities replacing one-off values; `variants()` for
   every recipe; layout (`Stack`, `Row`, `Grid`, `Page`, `PageHeader`, `Section`) and text
   (`Text`, `Heading`) primitives; icons moved into the kit with sizes; `ProviderMark`,
   `Terminal`, `Suggestions`, `ListCard`, `WorkspacePreview`, `menuTrigger`; the interactive
   prototype and the component sections; and `kit-guard.test.ts` holding kit-built files to
   no inline or one-off styling.

3. **App shell and home on the kit (agent/frontend/port-shell).** Sidebar, project tree (row
   actions on hover, right-click and long press, inline rename, running shimmer), workspace
   switcher, account menu, title bar and phone top bar, drawer, command palette, shortcuts,
   banners, create-workspace dialog, session tabs, the composer and the new-chat screen. New kit
   pieces: `AppFrame`, `AuthFrame`, menus opened at a point, `NavGroup`/`NavNote`, row actions,
   `InlineInput`, `WorkingDots`, `Shimmer`, `FloatingNotice`, `LinkButton`, `AgentMark`, palette
   keyboard support, and `pt-safe`/`pb-safe`. The old status bar is gone: the folder lives in the
   composer tray and the tree, the runner warning floats.

4. **Thread view on the kit (agent/frontend/port-thread).** Conversation, transcript (messages
   with hover actions and long-press menus, thinking, tool groups on a rail, plans, notices,
   approvals), diffs, model and mode pickers, and @-mentions. New kit pieces: `Prose`,
   `DiffStat`, the richer `DiffCard` (numbered, highlighted, show all), `Disclosure`, `Rail`,
   `Pre`, `PlanList`, `InlineNotice`, `DecisionCard`, `AutocompleteList`, `IconButton` tooltips,
   a quiet `Banner`; kit `Toasts` mounted at the root beside the old toaster.

5. **Board on the kit (agent/frontend/port-board).** Lanes, cards, stage tabs, toolbar, quick
   add, card menus (⋯ on hover, right-click and long press), drag and drop, the new-task sheet
   and the task drawer. New kit pieces: `TaskCard` for real tasks (link, drag source, actions),
   `BoardColumn` as a drop target, `LaneStrip`, `BoardSkeleton`, `InlineAdd`, `ChoiceChips`,
   `TitleInput`, `PropertyRow`, `PanelBar`, `CheckboxField`, `NobodyMark`, `LoadingBar`, a
   danger `IconButton`, `Prose` framed with click delegation, and `Segmented` counts and
   `aria-controls`. Component tests get a popover polyfill (`kit/test-setup.ts`) so kit menus
   open in happy-dom the way they do in a browser.

6. **Files and notes on the kit, in the prototype's layout (agent/frontend/port-files).** Both
   are full-bleed list-and-reader screens: a pane list on the left, the open item beside it, one
   at a time with a way back on phones; the open item is in the URL. Files is a tree that loads
   folders as they open, with the chosen file shown in numbered lines, read through a new runner
   route (`GET /projects/files/:slug/content`, contained to the project folder, 512 KB cap,
   binary files named but not sent). The project sheets, folder browser and project marks move
   too, so the projects module no longer imports `@/ui`. New kit pieces: `ListDetail`,
   `PaneHeader`, `ListRow`, `FolderTree`, `CodeView`, `ProjectMark`/`PixelMark`,
   `ColorSwatches`, `GlyphChoices`, `TextLink`.

7. **Shell and board matched to the /design prototype (agent/frontend/match-prototype).** The
   desktop title bar is the sidebar toggle and the tabs (or the screen's name) only: the
   project-views switcher repeated the sidebar and is gone, and "New task" moved into the board's
   toolbar. The phone bar centres the title with one action (New task on the board, New chat
   elsewhere). The board is full-bleed with lanes running to the bottom and scrolling their own
   cards; the toolbar reads search, view, owner, then New task. The home heading keeps "in" on
   its first line, the model chip shows the short model name, and thread tabs size to their
   titles.

8. **Terminal on the kit (agent/frontend/port-terminal).** Terminals are the title bar's tabs on
   desktop, as threads are (status dot, machine or "ended" badge, close), with the new-terminal
   button or machine menu and the text size beside them; phones switch, open and close from a
   menu on the title. The selection bar, drag handles, "latest output" pill, touch scrollbar and
   key bar, and the floating dictation mic, status and error, are kit pieces. New kit pieces:
   `SelectionBar`, `SelectionHandle`, `JumpToLatest`, `TouchScrollbar`, `terminalKey`,
   `KeyStrip`, `PageDots`, `VoiceDock`, `VoiceStatus`, `VoiceError`, `FLOATING_MIC`, and
   `HeaderTabs` badges and a `newAction` slot.

### Validation

- Terminal port: console vitest 47 files / 288 tests; guard, lint, typecheck, architecture and
  naming pass. Checked in the browser against this machine's runner: the header tab with its
  live dot, text size, and at 375px the terminal menu (switch, new on this machine or an
  environment, close) and the key bar.

- Prototype match: console vitest 47 files / 288 tests (top-bar tests cover the phone action);
  guard, lint, typecheck, architecture and naming pass. Compared against /design at 1280px and
  375px on home, a thread and the board, signed in as the demo account.

- Files port: console vitest 47 files / 286 tests, runner 110 tests (file reads: text, binary,
  oversized, traversal and symlink escapes refused); guard, lint, typecheck, architecture and
  naming pass. Checked in the browser on throwaway copies of the database and the runner's chat
  database (removed afterwards): the Grid repo's tree, reading files, writing a note, and at 375px
  the tree and the file view.

- Board port: console vitest 47 files / 285 tests (board, card and panel tests open the kit menus
  like a person); the board no longer imports `@/ui`; guard, lint, typecheck, architecture and
  naming checks pass. Checked in the browser against a throwaway clone of the database (dropped
  afterwards): quick add, moving a card from its menu, the task drawer, and at 375px the stage
  tabs, toolbar and new-task sheet.

- typecheck, lint, architecture check pass; console vitest 45 files / 282 tests pass.
- Thread port: console vitest 47 files / 285 tests (chat tests query by meaning, not old class
  names); the chat module no longer imports `@/ui`; checked a real thread in the browser.
- Shell port: console vitest 47 files / 285 tests (shell tests follow the new tree); guard
  passes on every ported file; checked in the browser signed in as the demo account: new chat,
  a thread in the header tabs, thread hover actions and menu, phone drawer.
- Hardening: console vitest 47 files / 285 tests (guard and `variants` tests added); roundness
  knob checked live across the prototype.
- `/design` checked at 1100px and 375px, light and dark; menus, dialog, drawer and palette
  opened.
