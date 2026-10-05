---
id: grid-operate-health-runner
title: operate monitoring and incident contracts
type: feature
from: human
to: backend
priority: high
status: doing
assignee: codex
reviewer: operate_review
parent: 2026-10-05-operate-health.md
depends_on: []
branch: agent/web/operate-health
worktree: /home/ghost/Projects/grid-worktrees/agent/web/operate-health
scope: [apps/runner/**]
allowed_shared: [.agents/board/**, apps/docs/content/docs/backend-api.mdx]
created: 2026-10-05
updated: 2026-10-06
---

## What

Implement persisted health/incident monitoring and expose workspace-scoped runner contracts.

## Scope

User approved the first Operate slice in this chat: health, incident history, and Inbox alerts. Atomic Console/runner changes use separate owners on this branch. Reuse Ship health storage and approved Figma Ship layout (401:17705); no Operate frame exists in the previously catalogued sections. Logs and costs remain follow-up slices. No automatic rollback, reconnect changes, raw payload logging, or live database replacement.

## Acceptance

Reuse Ship probes where practical; background monitoring independent of browser; bounded history and safe URL handling; consecutive failures open incidents, consecutive successes resolve; stale/missing checks unknown; restart persistence and notification events scoped to workspace/project. Publish compact agreed contract to web owner before coding. Backend owns runner and API contract docs.

## Validation

Focused lifecycle/auth/isolation/restart tests; runner full tests/lint/typecheck; Console full tests/lint/typecheck/build and kit guard; desktop and phone browser walkthrough; architecture check; independent review. Preview ports Console 3023, runner 4123; never send contract tests to live port 4000.

## Resolution

Implementation and code review complete; card remains doing until browser validation and the full runner suite pass.

Changed: Console Operate module/navigation/workspace routing and Inbox labels; runner Operate probe/store/service/routes, Ship settings inheritance and Inbox delivery; documented API contract and changelog. Logs and costs remain deferred.

Validation (2026-10-06):
- Console full suite: 595/595 passed, 104 files (`bun --cwd=apps/console run test`).
- Operate runner tests: 11/11 passed, including 50 timeout targets at one-minute intervals, same-address manual overrides, capacity reclamation, auth/isolation, restart/outbox and stale observer behavior.
- Independent reviewer also ran Operate/Ship/Inbox tests: 50/50 passed.
- Runner full suite: 428 passed, 1 failed, reproduced on a second full run. Failure: `src/automations/service.test.ts`, "deduplicates GitHub items and caps concurrent runs without losing the item" assumes creation-order scheduling although the store orders by updated_at DESC. No automation files changed. Isolated automation rerun: 12/12 passed; unchanged main baseline full suite: 418/418 passed. Full runner gate is unresolved; do not claim it passed.
- Repository lint, typecheck, format, architecture/naming and Console production build passed. Existing lint warnings remain.
- Console kit guard: 2/2 passed. `git diff --check`: clean.
- Preview Console http://localhost:3023/demo/operate/grid HTTP 200; runner http://localhost:4123/health HTTP 200; unauthenticated Operate API 401. Preview runner restarted with reviewed fixes, using isolated `/tmp/grid-operate-preview.db`.
- Desktop/phone browser walkthrough blocked: browser tool reported no available browsers; no UI screenshots or browser verification claimed.

Contract: backend-api.mdx Runner Operate section and 2026-10-06 changelog. Monitoring preserves existing reconnect behavior and stores no response bodies, credentials, message text or file contents.

Review: `operate_review` approved current code after all three P2 findings were fixed. No new actionable defects. Review approval explicitly excludes unfinished browser validation.

Delivery: draft PR; keep unmerged until full validation and user preview review. Feature commit: 9b6467942836c188767ab3e4844277b393730bd0, independently approved against base 9fc9bb8. Live services are unchanged; preview uses 3023/4123.

Ownership handoff: operate_backend delivered the initial implementation; codex completed runner review fixes and validation in the backend card after that agent became unavailable. The atomic parent Console card and backend card retain their separate path scopes.

## Owner-approved release

On 2026-10-06 the human owner requested "do the merge and restart the servers and tell me whats is next" after the prior reply disclosed the remaining browser, automation-test and dependency-review blockers. This direct release instruction governs this integration; no missing check is represented as passed.

Merge order: PR #174 (base 9fc9bb8) is already merged, then PR #175. Feature commit 9b6467942836c188767ab3e4844277b393730bd0 was independently approved. Subsequent changes only record board evidence. Target integration checkout `/home/ghost/Projects/grid` has no local changes; deployment uses `/home/ghost/Projects/grid-worktrees/serve`. Preserve its untracked docs guidance files.

Live GitHub checks on head 32a9651: lint, typecheck, build and API contracts pass. CI test fails because the migrated test database lacks `demo@grid.dev`; the same billing fixture failure is confirmed on already merged PR #174. Dependency review lacks repository support and CodeQL reports inaccessible integration/code-scanning support; those security jobs also failed on PR #174. No workflows or security settings are changed to conceal these failures. Browser walkthrough remains unverified. Track these as immediate follow-up work after the owner-approved release.

Release result and live verification will be linked from PR #175 and reported to the owner. Cards remain doing until their unfinished validation is resolved.
