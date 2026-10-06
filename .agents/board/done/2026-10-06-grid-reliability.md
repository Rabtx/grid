---
id: grid-grid-reliability
title: grid reliability audit and confirmed fixes
type: bug
from: human
to: pm
priority: high
status: done
assignee: codex
reviewer: reliability_review
parent: none
depends_on: []
branch: agent/backend/reliability-audit
worktree: /home/ghost/Projects/grid-worktrees/agent/backend/reliability-audit
scope: [.agents/board/**]
allowed_shared: []
created: 2026-10-06
updated: 2026-10-06
---

## What

Close the five merged Notifications/Operate cards and coordinate a fresh reliability pass over authentication, workspace isolation, runner/agents/files, project flows, network/error state, persistence, and CI. Record confirmed defects, fixes, real verification and residual risks. Backend and web child cards own implementation; reviewer independently audits and reviews.

## Validation

Confirm each bug with a failing regression or precise reproduction before fixing. Preserve API contracts, security/privacy and existing UI kit. Role suites, root lint/typecheck/format/architecture, affected builds, isolated database/contract tests, independent review and exact commit evidence. No tests on live API 4000 or live chat database. No paid agent turns, production billing changes, repository access expansion or security checks disabled. Browser validation only via available approved browser surface; record if unavailable.

## Resolution

Claimed before implementation. Base main `353da67ef5f8bc02aa74e67a0cfc32ffd646f315`. User requested marking merged cards done and an application-wide reliability audit/fixes. PM owns board only; separate backend/web owners share this atomic worktree with disjoint application paths; reviewer read-only. Tailscale/private monitoring, PGlite and new features remain deferred. Fix confirmed bugs, avoid speculative refactors; report any residual issue with evidence rather than claiming the whole app bug-free. Delivery is reviewed fixes and PR; no new application merge/restart inferred.


## Audit delivery evidence

Independent reviewer `reliability_review` approved the frozen implementation for commit after reproducing authentication attempt-count, cookie logout, workspace attribution, private route-memory, note hydration and socket lifecycle defects. Exact committed-head review follows. Five previously merged feature cards are moved to done; new reliability cards stay doing through draft PR/CI/manual verification. No reliability merge or live restart has occurred.

Confirmed fixes: account-bound request replay, stale sign-ins and cookie ordering; verified own-session logout despite concurrent refresh; atomic OTP/MFA attempt limits; account/workspace-scoped caches and file/chat memories; stale thread/note snapshots; preserving typing during saves and invalidating old file/machine responses; workspace-only live file attribution; own valid Operate project entries; disconnect-during-auth cleanup; isolated billing fixtures; CD PostgreSQL/migrations; deterministic automation concurrency assertions; CodeQL job-scoped workflow read permission.

Validation uses disposable PostgreSQL `127.0.0.1:54394`, separate unseeded unit and seeded contract databases, API `4037` and temporary runner data. Final API 57/57, black-box contracts 80/80, web 31/31, database 6/6, logger 3/3 and Rust lint/test passed. Runner 448/448 passed before the final three lifecycle regressions; full runner and Console are being finalized. Browser inventory has no enabled surface. External Security feature eligibility remains on its own open card; no checks are disabled.


Final role suites: Console 637/637 across 113 files with two workers; runner 451/451 across 61 files, including all three new lifecycle regressions; API 57/57; black-box API contracts 80/80. Web 31/31, database 6/6, logger 3/3 and Rust lint/test passed. All test databases/servers were disposable and isolated from live port 4000 and the live chat database. Frozen implementation has independent reviewer approval with no unresolved code findings; committed-head review and PR CI will be recorded on the PR. Browser and security configuration remain separate open follow-ups.

Root application build `bun run ci:build` passed for Console, web and docs. Required format/lint/typecheck/architecture/secret/large-file/commit-message hooks stay enabled for commit.


## Closed

Merged to main in shabirkhan-dev/grid#177 (squash `e4583d1`, 2026-10-06). Work found later in stashes from those worktrees was reviewed and landed in shabirkhan-dev/grid#180 (`18f2ad8`). Browser verification stays open on `2026-10-06-browser-verification.md`.
