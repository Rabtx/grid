---
id: grid-remove-freebuff
title: remove freebuff from grid
type: chore
from: pm
to: runner
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-freebuff-failures-and-claude-models
depends_on: []
branch: agent/runner/remove-freebuff
worktree: ../grid-worktrees/remove-freebuff
scope: [apps/runner/**, apps/console/src/modules/chat/**, apps/console/src/modules/projects/components/files-screen.tsx, README.md, .agents/plans/product-roadmap.md]
allowed_shared: [bun.lock]
created: 2026-10-08
updated: 2026-10-08
---

## What

The Freebuff account is suspended. The person decided Grid should no longer drive Freebuff; when they want it, they will run it from a terminal themselves.

## Proposal or Ask

Remove everything related to Freebuff from Grid.

## Resolution
Fixed by claude, 2026-10-08.

- **Removed from the runner:**
  - Freebuff's adapter: `freebuff.ts`, `freebuff-screen.ts`, `freebuff-chats.ts` and `freebuff-export.ts`.
  - Its tests and fake CLI.
  - The terminal-screen reader `tui.ts`, which only Freebuff used.
  - The `@xterm/headless` dependency.
  - Its registry, binary, setup, notification-name and commit-sign entries, and its place in the no-connectors, pulse and search lists.
  - `turn_rewrite` from the runner's event type, since nothing sends it now.
- **Removed from the console:** Freebuff's name in the agent-name maps.
- **Kept on purpose:** the console still folds `turn_rewrite` from older logs, so existing Freebuff threads read as they were shown. Its comment says so. The console test's notes card is now titled "Session notes".
- **Docs:** the README no longer lists Freebuff. The runner README drops the terminal-agent paragraph. Roadmap A5 now says the feature was built and then removed, and why.
- **Browser, on a test copy of this branch with the old scratch data:**
  - Settings lists Claude Code, opencode, Antigravity and Codex.
  - The new-thread picker lists the same four.
  - An old Freebuff thread still shows its history, and a new message there ends with "That agent is no longer available".
- **Checks:** runner 483 / 483 (the 39 Freebuff tests went with it), console 721 / 721; typecheck, lint and format pass.
