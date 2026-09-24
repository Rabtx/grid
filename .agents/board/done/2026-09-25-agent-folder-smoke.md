---
id: str-agent-folder-smoke
title: Prove every agent works in the project folder, with a repeatable smoke check
type: chore
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: [str-codex-adapter]
branch: agent/ui-ux/agent-folder-smoke
worktree: ../grid-worktrees/agent/ui-ux/agent-folder-smoke
scope:
  - apps/runner/scripts/**
  - apps/runner/package.json
  - apps/runner/src/agents/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

A script (`bun --cwd=apps/runner run smoke`) that, for each installed agent, starts a thread
through the hub in a fresh temp project folder, asks it to create a file, resumes the thread and
asks it to change the file, and checks both happened in that folder. Fix whatever it finds.

## Validation

The script's real output for every installed agent, on the card.

## Resolution

Landed in #56. `apps/runner/scripts/smoke.ts` (`bun --cwd=apps/runner run smoke [agent…]`): per
installed agent, a fresh temp project folder in a real `ChatStore`, a thread through `ChatHub`
that creates `grid-smoke.txt`, then a new hub on the same store (a runner restart) and a resumed
turn that appends to it; approvals are answered with the first allow option.

Real results (2026-09-25):

```
agent        created  resumed
claude       ✓        ✓
opencode     ✓        ✓
antigravity  ✓        ✓   (first run wandered 4 min via its cross-chat memory; rerun passed)
codex        ✓        ✓
```

