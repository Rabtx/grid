---
id: grid-split-view
title: split view - work in two panes side by side, with open in split from search
type: feature
from: human
to: web
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/web/split-view
worktree: /home/ghost/Projects/grid-worktrees/agent/web/split-view
scope: [apps/console/src/modules/split/**, apps/console/src/kit/split*]
allowed_shared: [apps/console/src/modules/chat/**, apps/console/src/modules/terminal/**, apps/console/src/kit/index.ts, apps/console/src/lib/local-store*, apps/console/src/modules/auth/context/auth-context.tsx]
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

The Figma section "21 · Split view" (frames 359:13773, 359:14141, 359:14534, 359:14693) puts split
view inside the thread, not on its own screen: a Focus · Split · Three switch in the title bar, a
tabbed workspace pane (Terminal, Preview, files) beside the thread, a second stacked pane in Three,
drag a tab to split, and on phones the workspace docked over the composer. The owner asked for the
most reliable, seamless version of it, and that is what was built.

**Built (`apps/console/src/modules/split/`, kit `split-tabs.tsx` and `split-layout.tsx`):**

- Focus · Split · Three in the desktop title bar, plus `/split` in the composer. Layout, divider
  and stack sizes, and open tabs are remembered per thread on the device (account-scoped storage).
  Saved layouts are validated on load, so a damaged or old entry falls back to defaults.
- **Terminal**: the thread's own shell, opened in its folder or worktree on the machine it runs on,
  the first time it is shown. It is reused across visits (same scrollback), and simultaneous opens
  are deduplicated. An exited shell keeps its output and offers Restart; a terminal the runner lost
  is reopened.
- **Preview**: frames the ports the runner reports the thread's shell serving, using the host Grid
  was opened on (so it works from a phone on the network). Under https it opens the server in a
  new tab instead, because the browser would block plain http inside the page.
- **Files**: any file the agent changed opens in a pane. A thread in the project folder reads the
  file live and re-reads it after each edit. A worktree thread shows the agent's diffs instead,
  because the project folder does not hold its copy and would show the wrong version.
- Panes are keyed by position and tabs stay mounted once opened, so switching tabs, modes or
  Focus never drops a terminal connection. The pane menu offers open, move to the other pane and
  close. Tabs drag between panes. The dividers drag, take arrow keys and reset on double-click.
- On phones, the workspace docks above the composer, toggled by a `</>` chip. Every tab is merged
  into one pane, and using the phone never rewrites the desktop layout. The Run details hide while
  split.

**Fixed along the way:** `main` went blank on every reload with a remembered user in the dev
build. `AuthProvider` restored the user with `setUser`, whose account listeners wrote to store
signals during the first render (`REACTIVE_WRITE_IN_OWNED_SCOPE`, which halts reactivity). It now
calls `localStore.restoreUser`, which sets the account silently: no account data can have been read
yet, so there is nothing to reset. Reproduced on `main` at http://127.0.0.1:3001 before the fix.

**Deferred:** "Open in split" from Search & Ask results. The `openTab` API is exported for it.

**Validation (2026-10-07):** console 118 files / 670 tests pass, including 21 new split tests
(layout rules, preview addresses, path containment) and a local-store regression. Root lint
(exit 0; the remaining warnings are pre-existing), format, typecheck, and architecture and naming
checks all pass. Browser checks against a console dev server on :3021 at 1440×900: Split, Three,
reload persistence, Focus→Split keeping the same live terminal element, divider drag (45%→32%,
minimum since raised to 35%), pane menu move/merge, a real preview of a localhost server started in
the thread terminal (then stopped), and the phone dock at 375px. Phone terminal rendering inside
the in-app browser's emulation is unreliable for the existing Terminal screen too, so it needs a
real phone check.

## Merged

Landed on `main` in shabirkhan-dev/grid#187 (squash `ee2e136`, 2026-10-07), with the fixes from PM review. Services rebuilt and restarted on `ee2e136`.
