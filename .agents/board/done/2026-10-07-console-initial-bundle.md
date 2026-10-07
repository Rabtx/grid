---
id: grid-console-initial-bundle
title: cut what the console loads before its first screen
type: perf
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
scope: [apps/console/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The first load preloads about 690 KB of JS: an `appearance` chunk of 337 KB, a projects chunk of 221 KB, and `marked` (see the built `index.html` modulepreload list).

## Proposal or Ask

Find what pulls these into the entry and split them, then measure before and after.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution
Fixed by claude, 2026-10-07. The JS loaded before first paint (the entry plus its modulepreloads in the built `index.html`) dropped from **954 KB raw / 273 KB gzip to 440 KB / 139 KB**, about half. `marked`, highlight.js, the board, the settings screens and the environment screens are no longer part of the first load.

Two causes:
1. **Every route other than chat, files, notes, PRs, Ship, Operate and the terminal was imported eagerly in `app.tsx`.** Every screen route is now `lazy()` behind a `Loading` boundary. Each import points at the component's own file: a module's index is also imported by the shell, and importing it lazily as well kept all of it in the entry.
2. **Solid's compiled components call `template()` and `delegateEvents()` at top level, so Rollup treated every module as side-effectful.** The shell's barrel imports (`@/modules/projects`, `environments`, `settings`…) therefore kept every screen they re-export. `apps/console/package.json` now declares `"sideEffects": ["*.css"]`; the only side-effect imports are the two stylesheets.

**Verified:** a built console (service worker cleared) against an isolated runner rendered 18 screens with no errors: home, Pulse, inbox, automations, board and task, machines, agents, all settings pages, and chat. Console 707 / 707, typecheck and lint pass.

**Follow-up:** the kit icon set (Hugeicons, about 50 KB) is still in the first load, since the shell's own icons use it.
