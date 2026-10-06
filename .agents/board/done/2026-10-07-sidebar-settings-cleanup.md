---
id: grid-sidebar-settings-cleanup
title: clean up the sidebar, threads panel and settings navigation, and add row actions on phones
type: bug
from: human
to: web
priority: high
status: done
assignee: web
reviewer: pm
parent: none
depends_on: []
branch: agent/web/sidebar-settings-cleanup
worktree: /home/ghost/Projects/grid-worktrees/agent/web/sidebar-settings-cleanup
scope:
  - apps/console/src/modules/shell/**
  - apps/console/src/modules/settings/**
  - apps/console/src/kit/nav.tsx
  - apps/console/src/app.tsx
allowed_shared:
  - apps/console/src/kit/context-menu.ts
  - apps/console/src/kit/menu.tsx
created: 2026-10-07
updated: 2026-10-07
---

## What

Five problems the owner found in the sidebar and settings, on phone and desktop:

1. **Counts look broken.** In the threads panel the project thread count (e.g. "28") collides with the collapse chevron. In the settings sidebar, "Members 1" and "Roles 4" read as stray numbers. Counts should be quiet and aligned, or removed where they add nothing.
2. **The collapse chevron shows on every project on desktop.** On fine pointers it must appear only on row hover or keyboard focus, like the other row actions.
3. **Settings has two navigations.** There is the settings list in the sidebar and an old settings index page (`settings-index-screen.tsx`, the card-style list with "Agents / Workspace / You"). Remove the old index page and keep only the sidebar list. `/settings` should land on a real section on desktop, and on phones should open the sidebar's settings list, not the old page.
4. **No actions on projects and threads on phones.** On touch, a long press on a project or thread row must open the same menu the desktop ⋯ opens (rename, delete, and so on), as a bottom sheet.
5. **The threads panel has two titles.** The panel header says "Threads" and the section below repeats "Projects" with its own + button. Keep the top title only, move the add-project + into the header next to search, and drop the "Projects" section label so the list starts clean.

## Why / Context

The owner's phone screenshots from 2026-10-07 show all five. The house rules on device-native interactions: no ⋯ drawn at rest; hover or focus on desktop with right-click opening the same menu; long press on touch with no visible button; and the container holding hidden actions must stay mounted on touch (`pointer-coarse:pointer-events-none`, never `pointer-coarse:hidden`), or the long-press menu can't open. Use `attachContextMenu` (`apps/console/src/kit/context-menu.ts`) and `Menu`'s `pointerOnly` / `control` props. Read `DESIGN.md`, `.agents/skills/solid-2/SKILL.md` and `.agents/skills/mobile-first/SKILL.md` first.

## Proposal or Ask

Definition of done:

- No count collides with a control. Counts that only restate the obvious are removed.
- Project collapse chevrons are invisible at rest on desktop and appear on hover or focus. On touch, collapsing still works by tapping the row's chevron area or the row itself. Choose the cleaner option and say which.
- `settings-index-screen.tsx` and its route are gone. Nothing links to it, and `/settings` behaves as described above on both sizes.
- Long press on a project row and on a thread row opens their menus on touch. Right-click and hover ⋯ still work on desktop.
- The threads panel has one title, with + next to search in the header and no "Projects" label.

## Scope

**In scope:** the paths in `scope` above. If anything outside them has to change, raise it with PM first.

**Out of scope:** the split view (its own card, `2026-10-07-split-view.md`), the Skills settings page (`2026-10-07-settings-skills.md` adds one sidebar entry; leave room for it and expect a one-line merge), and backend changes.

## Validation

- Focused Vitest regressions for: the chevron hidden at rest on fine pointers, long-press menus on touch, `/settings` routing, and the single panel title.
- Console `bun run test`, root `bun run lint`, `bun run format`, `bun run typecheck`, `bun run architecture:check`.
- Screenshots at phone (375px) and desktop widths, light and dark, attached to the PR.
- Open a PR against `main` and record the PR link and exact test counts here. PM verifies before merge.

## Resolution

PR: https://github.com/shabirkhan-dev/grid/pull/186 (base `main`, head
`agent/web/sidebar-settings-cleanup`). Commits `b0ad6dd` (the change) and `486b49e` (the
screenshots). Reviewer: pm.

### Changed

- `apps/console/src/kit/nav.tsx`
  - The chevron (`trailingAction`) now sits in its own wrapper that is `opacity-0` at rest and
    revealed on `group-hover/row` and `group-focus-within/row`, with `pointer-coarse:opacity-100`.
    On fine pointers it is invisible until hover or focus; on touch it is always drawn.
  - Level-0 rows are `pointer-coarse:min-h-11`, so the 44px chevron fits inside a 30px row.
  - The actions container no longer sets `pointer-coarse:pointer-events-none`. It keeps the
    triggers hidden with `pointer-coarse:[&>button]:hidden` and stays interactive itself, so the
    popover it holds no longer inherits `pointer-events: none`.
  - The gesture handler is read when the gesture fires rather than captured when the row settles.
- `apps/console/src/modules/shell/components/sidebar.tsx` — `ProjectsBody` drops the `NavSection`
  wrapper (no "Projects" label); the panel header gains the add-project `+` beside search, and the
  new-thread button uses `EditIcon` so the header shows two different glyphs.
- `apps/console/src/modules/shell/components/project-tree.tsx` — the thread count is gone from the
  project row.
- `apps/console/src/modules/settings/components/settings-index-screen.tsx` — **deleted**, with its
  export removed from `modules/settings/index.ts` and its route from `app.tsx`.
- `apps/console/src/modules/settings/components/settings-route.tsx` — **new**. `/settings` replaces
  to `/settings/profile` on desktop; on a phone it renders `SettingsSidebar bare` under the phone's
  own title bar and takes the phone bar's trailing slot so no "New thread" button appears.
- `apps/console/src/modules/settings/components/settings-sidebar.tsx` — the members and roles
  counts, and the member-list fetch behind them, are removed; the now-unused `settingsTone` export
  goes with them; the machines online dot stays.
- `apps/console/src/kit/nav.test.tsx` — **new**, 5 tests.
- `apps/console/src/modules/shell/components/project-tree.test.tsx` — +2 tests.
- `.agents/board/open/2026-10-07-popover-control-stale.md` — **new card**, raised (see below).
- `.agents/board/screenshots/sidebar-settings-cleanup/` — 9 screenshots.

### Validation

- `bun --cwd=apps/console run test`: **117 files, 655 tests, all passing** (was 116 files / 647
  tests on `main`; +5 new).
- `bun --cwd=apps/console run test src/kit/nav.test.tsx`: 5 passed.
- `bun --cwd=apps/console run test src/modules/shell/components/project-tree.test.tsx`: 6 passed.
- `bun run lint`: exit 0. The console's 4 warnings and every web/runner/@grid/ui warning are
  identical with and without this branch (compared by stashing), so no new lint output.
- `bun run typecheck`: all workspaces exit 0.
- `bun run format`, `bun run architecture:check` ("Architecture checks passed"),
  `bun run naming:check` (886 paths OK), `bun --cwd=apps/console run build`: clean.
- lefthook pre-commit ran all hooks (architecture, format, large-files, lint, secrets,
  trailing-whitespace, typecheck) and passed on both commits.
- Browser (Playwright + Chromium 1.63, against a production build of this branch, signed in as the
  seeded demo account): **17/17 checks pass** — one title in the panel, no "Projects" label, the
  `+` inside the header, no count on project rows, chevron `opacity=0` at rest and `1` on hover on
  desktop, `opacity=1` and 40x40 on touch, the actions container `display:flex` /
  `pointer-events:auto` / trigger `display:none` on touch, the settings list free of stray counts,
  `/settings` → `/settings/profile` on desktop, and the page list with exactly one visible title at
  `/settings` at 375px. Two first-run failures were flaws in my checks, not the UI: I had hovered
  the wrong row, and counted the hidden drawer panel's heading as a second title.
- Screenshots (committed under `.agents/board/screenshots/sidebar-settings-cleanup/`, linked from
  the PR): `desktop-threads-1440-light`, `desktop-threads-hover-1440-{light,dark}`,
  `desktop-settings-1440-{light,dark}`, `phone-drawer-375-{light,dark}`,
  `phone-settings-375-{light,dark}`.

### Decisions

- **Chevron on touch** (the card asked me to choose and say): it stays visible and is tapped
  directly. The alternatives — tapping the row itself, or the row toggling as well as navigating —
  either remove collapsing or make an ordinary tap do two things. A disclosure control that is
  visible, always in the same place, and does one thing is the least surprising on a phone.
- **Settings on phones**: `/settings` renders the sidebar list as the screen rather than opening
  the drawer. Opening the drawer would leave an empty canvas behind it and make Back ambiguous.

### Blocked, and raised rather than worked around

Long press and right-click now **reach** each row's menu, and the press that ends it no longer also
navigates. The menu then fails to open, because `apps/console/src/kit/popover.tsx:75` hands the
caller its `PopoverControl` as a side effect of the component body: every body re-run builds a new
panel, so the control the caller kept points at a detached element and `showPopover()` throws
`InvalidStateError: Invalid for popovers within documents that are not fully active`.

This is **pre-existing and reproduced on `main`** (the `serve` worktree at `localhost:3001`,
dev server and production build alike), and `kit/popover.tsx` is outside this card's scope, so it
is raised as `2026-10-07-popover-control-stale.md` with the measurements rather than patched here.
It affects every `control` consumer: board cards, notes, panes, the file tree, messages. The two new
long-press tests assert the part this card owns — the gesture arriving at the row's handler — and
say so in a comment pointing at that card.

I verified the underlying mechanism in Chromium before changing `nav.tsx`: an ancestor's
`pointer-events: none` makes every item in a top-layer popover untappable, while an ancestor's
`opacity: 0` does not reach it. That is why the container keeps its opacity trick and gives up the
pointer-events one.

### Merge note

`SETTINGS_SECTIONS` is untouched, so `2026-10-07-settings-skills.md` merges as two lines: one entry
in `SETTINGS_SECTIONS` and one glyph in `ICONS`, both in `settings-sidebar.tsx`. The split view
card is untouched.

### Contract impact

None. No API, schema or public-contract change; console UI only.

## Merged

Landed on `main` in shabirkhan-dev/grid#187 (squash `ee2e136`, 2026-10-07), with the fixes from PM review. Services rebuilt and restarted on `ee2e136`.
