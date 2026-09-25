---
id: str-project-look-activity
title: Running chats animate, projects get their own icon and colour, and phones show just the title
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/ui-ux/project-look-activity
worktree: ../grid-worktrees/agent/ui-ux/project-look-activity
scope:
  - apps/nest-api/src/database/**
  - apps/nest-api/src/modules/projects/**
  - apps/runner/src/chat/**
  - apps/console/src/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## Resolution

- Running chats: the runner lists threads with a turn in flight (`GET /chat/running`, with
  their project); the console polls it every 3 s while visible and the open conversation marks
  its own thread at once. Running threads shimmer (sidebar, desktop tabs, phone title) with three
  rising dots in place of their age; a project with work in flight animates its icon — pixel
  mascots alternate two frames, other icons breathe with a live dot. The transcript's "Working"
  uses the same language. Everything is still under reduced motion.
- Project look: `projects.icon` and `projects.color` (migration 0005, nullable) through the API;
  "Customize…" in the project menu opens a sheet with a live, animated preview, ten palette
  colours plus a custom colour (automatic by default, stable per project), and icons: 37 symbols,
  six original 8×8 mascots (robot, cat, rocket, sprout, blob, ghost), folder or letter.
- Phones: in a chat the header is the menu and the thread's title only — no tab pill, no view
  switch (the drawer reaches the board).

Validation: API 23 tests, runner 51 (new running test), console 187 (new project-look tests),
typecheck and lint clean; Playwright at 1440×900 and 390×844: running indicators present, phone
header is the title alone, Customize (menu on desktop, long press on phone) saves
`{icon: "mascot:rocket", color: "teal"}`; no console errors or strict warnings.
