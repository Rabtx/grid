---
id: grid-operate-health
title: operate health, incidents and inbox alerts
type: feature
from: human
to: web
priority: high
status: doing
assignee: codex
reviewer: operate_review
parent: none
depends_on: []
branch: agent/web/operate-health
worktree: /home/ghost/Projects/grid-worktrees/agent/web/operate-health
scope: [apps/console/**]
allowed_shared: [.agents/board/**, apps/docs/content/docs/backend-api.mdx]
created: 2026-10-05
updated: 2026-10-06
---

## What

Deliver service health and incidents with alerts in the existing Inbox.

## Scope

User approved the first Operate slice in this chat: health, incident history, and Inbox alerts. Atomic Console/runner changes use separate owners on this branch. Reuse Ship health storage and approved Figma Ship layout (401:17705); no Operate frame exists in the previously catalogued sections. Logs and costs remain follow-up slices. No automatic rollback, reconnect changes, raw payload logging, or live database replacement.

## Acceptance

Live observed health, response times, measured availability and coverage; unknown for stale monitoring; debounced outage/recovery, persisted timeline, deduplicated alerts; loading/empty/offline/error and workspace switching; use existing kit and Appearance tokens.

## Validation

Focused lifecycle/auth/isolation/restart tests; runner full tests/lint/typecheck; Console full tests/lint/typecheck/build and kit guard; desktop and phone browser walkthrough; architecture check; independent review. Preview ports Console 3023, runner 4123; never send contract tests to live port 4000.

## Resolution

Implementation and code review complete; card remains doing until browser validation and the full runner suite pass.

Changed: Console Operate module/navigation/workspace routing and Inbox labels; runner Operate probe/store/service/routes, Ship settings inheritance and Inbox delivery; documented API contract and changelog. Logs and costs remain deferred.

Validation (2026-10-06):
- Console full suite: 595/595 passed, 104 files (`bun --cwd=apps/console run test`).
- Operate runner tests: 11/11 passed, including 50 timeout targets at one-minute intervals, same-address manual overrides, capacity reclamation, auth/isolation, restart/outbox and stale observer behavior.
- Independent reviewer also ran Operate/Ship/Inbox tests: 50/50 passed.
- Runner full suite: 428 passed, 1 failed, reproduced on a second full run. Failure: `src/automations/service.test.ts`, "deduplicates GitHub items and caps concurrent runs without losing the item" expects creation-order scheduling when timestamps tie. No automation files changed. Isolated automation rerun: 12/12 passed; unchanged main baseline full suite: 418/418 passed. Full runner gate is unresolved; do not claim it passed.
- Repository lint, typecheck, format, architecture/naming and Console production build passed. Existing lint warnings remain.
- Console kit guard: 2/2 passed. `git diff --check`: clean.
- Preview Console http://localhost:3023/demo/operate/grid HTTP 200; runner http://localhost:4123/health HTTP 200; unauthenticated Operate API 401. Preview runner restarted with reviewed fixes, using isolated `/tmp/grid-operate-preview.db`.
- Desktop/phone browser walkthrough blocked: browser tool reported no available browsers; no UI screenshots or browser verification claimed.

Contract: backend-api.mdx Runner Operate section and 2026-10-06 changelog. Monitoring preserves existing reconnect behavior and stores no response bodies, credentials, message text or file contents.

Review: `operate_review` approved current code after all three P2 findings were fixed. No new actionable defects. Review approval explicitly excludes unfinished browser validation.

Delivery: draft PR; keep unmerged until full validation and user preview review. Commit is the feature commit containing this evidence, to be linked from the PR. Live services are unchanged; preview uses 3023/4123.
