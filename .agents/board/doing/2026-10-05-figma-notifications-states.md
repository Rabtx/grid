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
scope: [apps/console/src/kit, apps/console/src/modules/notifications, apps/console/src/modules/chat, apps/console/src/modules/environments, apps/console/src/modules/inbox, apps/console/src/modules/projects/components/notes-screen.tsx, apps/console/src/modules/settings/components/agents-screen.tsx, apps/console/src/modules/settings/components/agents-screen.test.tsx, apps/console/src/modules/shell, apps/console/src/routes, apps/console/src/app.tsx, apps/console/src/lib/active-workspace.ts]
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

Changed:
- Console kit notifications/failed/empty/loading states; global attention module, offline banner and machine name.
- Operational Machines and Agents routes, live resources/terminals/activity and permission-aware Stop/Answer actions.
- Runner pending approvals, workspace/thread/option validation, delivery-aware action routes, active-thread activity summaries and push wording; backend contract updated.

Validated:
- Console full suite: 586 tests passed across 102 files; final meter/operations targeted suite: 4 passed (one additional meter regression).
- Runner full suite with TMPDIR=/tmp: 418 passed across 57 files. Default fixture temp root differed from /tmp; no product change was needed.
- Console/runner lint and typecheck passed (pre-existing lint warnings); Console production build, architecture/naming, git diff --check passed.
- Browser: authenticated desktop 1280, phone 375/320 and tablet 768; live resource values, empty activity/terminal states, navigation and no horizontal overflow. Populated approvals, run/Stop and remote placement behavior covered by regression tests; no paid agent turn was started.
- Preview Console :3021; scratch preview runner :4121 (separate chat database), API :4000. Preview http://10.59.31.190:3021/demo/machines.

Reviewed:
- Independent reviewer approved final code; independently 45 runner tests passed. Fixed cross-thread approval delivery, stale account/poll state, replacement arrivals, late placements and active threads beyond recent limit. Browser caught meter scale, fixed and tested.

Outcome:
- Implementation ready for PR review. Ship #173 was already merged at eb24049; this follow-up is not merged. Commit/PR will be recorded before card closure.
