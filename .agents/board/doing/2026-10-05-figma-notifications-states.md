---
id: str-figma-notifications-states
title: Finish Figma notifications, states, machines and agents
type: feature
from: human
to: web
priority: high
status: doing
assignee: codex-recovery
reviewer: independent-review
parent: none
depends_on: []
branch: agent/web/figma-notifications-states
worktree: /home/ghost/Projects/grid-worktrees/states
scope: [apps/console/src/kit, apps/console/src/modules/notifications, apps/console/src/modules/chat, apps/console/src/modules/environments, apps/console/src/modules/inbox, apps/console/src/modules/projects/components/notes-screen.tsx, apps/console/src/modules/settings/components/agents-screen.tsx, apps/console/src/modules/settings/components/agents-screen.test.tsx, apps/console/src/modules/shell, apps/console/src/routes, apps/console/src/app.tsx]
allowed_shared: [apps/runner/src/chat/hub.ts, apps/runner/src/chat/routes.ts, apps/runner/src/chat/chat.test.ts, apps/runner/src/push/notifier.ts, apps/runner/src/push/notifier.test.ts, apps/docs/content/docs/backend-api.mdx]
created: 2026-10-05
updated: 2026-10-05
---

## What

Recover the user's interrupted Notifications/States/Machines/Agents request from Figma file Dx4ZZ1v693wRzVDKzunhQA. Continue its existing worktree and deliver a reviewable PR with real functionality.

## Why / Context

The previous session left uncommitted implementation here. Its imported chat and forks fail context compaction. The user explicitly requested recovery and continuation; this records that authorized slice.

## Proposal or Ask

Verify and finish approval/arrival notifications, reconnecting/no-machine/failed-run/empty/loading states, Machines and Agents screens. Reuse kit and Appearance tokens; depth off by default. Open a PR and branch preview on 3021. Merge only when explicitly approved.

## Scope

Console paths above and the runner approval query/action and push wording needed for real notifications. Document the runner contract. No unrelated services or policies.

## Validation

- Console lint, typecheck, full tests, build, desktop and phone browser checks.
- Runner lint, typecheck, full tests and approval authorization/resolution checks.
- Architecture boundaries, explicit-path review and independent reviewer.

## Resolution

Recovery in progress. Ship PR #173 is confirmed merged (eb24049). This follow-up had no commit or PR at takeover.
