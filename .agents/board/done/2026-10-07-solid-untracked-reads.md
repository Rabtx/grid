---
id: grid-solid-untracked-reads
title: fix the reactive reads solid warns will never update
type: bug
from: pm
to: web
priority: low
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/console/src/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The console logs `STRICT_READ_UNTRACKED` warnings by the hundred (174 on one page): reactive values read in effect callbacks, which will not update.

## Proposal or Ask

Find the sources and fix each read, so the console runs with no such warning.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution
Fixed by claude, 2026-10-07. The console now runs with no `STRICT_READ_UNTRACKED` warnings: a fresh tab across 30 routes logged none, down from 68 on opening a thread and 174 on one page.

- **How the sources were found:** a temporary hook recorded each warning's stack in the browser (removed again). The component tests now catch the rest.
- **Real bugs** (values that would not update):
  - the project tree's "keep the open thread visible" effect never followed whether its project was current;
  - the PR fix sheet read its runner scope untracked;
  - a PR's history count, the machine name badge and the floating panel's body were read straight in `<Show>` callbacks, so they wouldn't update. They now render through JSX.
- **Deliberate reads made explicit with `untrack`:**
  - loaders called from effects, whose compute already decides when to run: git control, profile, members, automations, connectors, diagnostics, Pulse and PR loads;
  - the environments store's `load`;
  - prop callbacks the kit calls from effects: `Dialog`'s `onClose`, `FileTree`'s `onExpand`, and the code minimap's `draw`;
  - signals seeded from props in `ConnectDialog`, the palette's mode, the model picker's focus ref, and the notification cards.
- **Guard:** `src/kit/test-setup.ts` now fails any component test that triggers the warning and reports where it happened. It found 13 more sources my browser walk hadn't reached, now fixed.
- **Checks:** console 707 / 707, typecheck and lint pass.
