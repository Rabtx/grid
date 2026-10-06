---
id: web-popover-control-stale
title: popover controls go stale on re-render, so right-click and long-press row menus never open
type: bug
from: web
to: web
priority: high
status: open
assignee: none
reviewer: pm
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/console/src/kit/popover.tsx]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07

## What

`Popover` hands the caller its `PopoverControl` as a side effect of the component body
(`apps/console/src/kit/popover.tsx:75`). The body re-runs whenever a prop it reads changes, and each
run creates a **new** panel element and a new closure over it. The panel from the last run is the one
in the document; the control the caller kept can be from an earlier run, so `open()` calls
`showPopover()` on a detached element and throws `InvalidStateError: Invalid for popovers within
documents that are not fully active`. Every row menu driven this way is dead: right-click and long
press do nothing.

## Why / Context

Found while working `2026-10-07-sidebar-settings-cleanup.md` (card item 4, long-press menus). It is
pre-existing and not caused by that card: reproduced on `main` at `localhost:3001` with the project
row's right-click. Reproduced in the dev server and in a production build of the same branch, so it is
not an HMR artefact.

Measured, in the browser, on the project rows of the Threads panel:

- right-click a project row → `showPopover` called on a panel with `isConnected === false`; no menu.
- the row's live panel (`kit-popover-cl-33`) and the panel in the retained control
  (`kit-popover-cl-47`) are different elements.

The same pattern exists in every consumer that uses `control`: `board.tsx`, `note.tsx`, `pane.tsx`,
`tree.tsx`, `message.tsx`, and the project and thread rows in `project-tree.tsx`.

## Proposal or Ask

Make the control stable per `Popover` instance instead of per render:

- hold the panel in a signal the `ref` writes, and build the `PopoverControl` once (`onSettled` or a
  `createMemo` keyed on nothing), so a body re-run cannot orphan it; **or**
- have `Menu`/`Popover` resolve the panel at open time from the document by id
  (`document.getElementById(id)`), which is what `place()` already assumes is live.

Definition of done:

- Right-clicking a project row in the Threads panel opens its menu, on desktop.
- A long press on a project row and on a thread row opens the menu as a bottom sheet, on a touch
  device.
- A regression test covers it: render a row whose menu re-renders, then fire the gesture and assert
  the menu's items are present and tappable.
- `bun --cwd=apps/console run test`, `lint`, `typecheck` clean.

## Scope

**In scope:**

- `apps/console/src/kit/popover.tsx`
- its consumers, only where a fix needs a call-site change

**Out of scope:**

- the visual and layout work in `2026-10-07-sidebar-settings-cleanup.md`, which is a separate branch

## Validation

- `bun --cwd=apps/console run test`
- `bun --cwd=apps/console run typecheck`
- browser check: right-click a project row; long-press it on a touch device

## Resolution