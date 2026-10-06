---
id: grid-split-view
title: split view - work in two panes side by side, with open in split from search
type: feature
from: human
to: web
priority: high
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: agent/web/split-view
worktree: /home/ghost/Projects/grid-worktrees/agent/web/split-view
scope: [apps/console/src/modules/split/**, apps/console/src/kit/split*]
allowed_shared: [apps/console/src/app.tsx, apps/console/src/modules/search/**, apps/console/src/modules/shell/components/app-shell*]
created: 2026-10-07
updated: 2026-10-07
---

## What

Build the Figma "Split view" screen (file `Dx4ZZ1v693wRzVDKzunhQA`, page "02 · App"): two panes side by side, each able to hold a thread, a file, a pull request or a note, with a resizable divider. Also add the "Open in split" action that the Search & Ask card left for later (`done/2026-10-05-figma-search-ask.md`).

## Why / Context

This is the last unbuilt screen from the locked Figma design. Appearance controls drive every value. On phones a side-by-side split doesn't fit, so the mobile behaviour is part of the design work and must feel native (switching between the two panes, not squeezing them).

## Proposal or Ask

Definition of done:

- On desktop, open any supported item in split from search, from a row menu and from a pane header. Resize the divider, swap or close panes, and the layout persists per project.
- On phones, the two panes become a native switch between them.
- Each pane keeps its own state (scroll position, unsaved drafts). Built from kit primitives, Solid 2 only.

## Scope

**In scope:** the paths in `scope`. In `allowed_shared`, only add the route, the "Open in split" entry points and the shell slot.

**Out of scope:** what's inside each pane type, beyond what's needed to host it.

## Validation

- Console tests for opening, resizing, persistence and the phone switch.
- Console suite, root lint, format, typecheck and architecture checks. Screenshots at phone and desktop sizes, light and dark. Open a PR for human review.

## Resolution

