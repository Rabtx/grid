---
id: str-pill-corners-everywhere
title: Pill corners reach every control (fields, segments, rows, menus, chips, board, settings)
type: bug
from: human
to: ui-ux
priority: high
status: done
assignee: ui-ux
reviewer: none
parent: none
depends_on: []
branch: ccr-78b19f86-o8youq
worktree: /home/user/grid (cloud session; the session's designated branch)
scope: [packages/tokens/src/kit.css, apps/console/src/kit/**, apps/console/src/styles/kit-guard.test.ts, DESIGN.md]
allowed_shared: []
created: 2026-11-03
updated: 2026-11-03
---

## What

Settings → Appearance → Corners → Pill only rounded `rounded-pill`/`rounded-tile` controls. Fields,
search boxes, segmented switches (Home/Activity, Build/Plan, density), tabs, menu items, sidebar,
tree, palette and list rows, attachment chips and icon squares used card corners
(`rounded-kit-*`) and stayed boxes, across every screen built on them.

## Resolution

- `kit.css`: `--kit-control-pill` (0, 9999px under pill) and `rounded-control-{xs,sm,,md,lg,xl}`
  = `max(kit size, control pill)`; `surface-field` uses it (a textarea keeps its box).
- 81 one-line controls and icon squares across 33 kit files moved to `rounded-control-*`; cards,
  lanes and multi-line items keep card corners. No module sets its own corner (kit guard).
- New guard: a kit class list with a one-line height and a card corner fails the build.
- Round, soft and square are unchanged: /design screenshots in round are pixel-identical apart from
  animations; pill screenshots show capsules everywhere.
