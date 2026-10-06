---
id: grid-sidebar-settings-cleanup
title: clean up the sidebar, threads panel and settings navigation, and add row actions on phones
type: bug
from: human
to: web
priority: high
status: doing
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

