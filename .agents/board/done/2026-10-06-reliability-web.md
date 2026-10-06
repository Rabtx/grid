---
id: grid-reliability-web
title: console and web reliability audit and fixes
type: bug
from: human
to: web
priority: high
status: done
assignee: reliability_web
reviewer: reliability_review
parent: 2026-10-06-grid-reliability.md
depends_on: []
branch: agent/backend/reliability-audit
worktree: /home/ghost/Projects/grid-worktrees/agent/backend/reliability-audit
scope: [apps/console/**, apps/web/**]
allowed_shared: [.agents/board/**]
created: 2026-10-06
updated: 2026-10-06
---

## What

Audit Console and marketing flows for confirmed errors: auth/workspace/project switches, stale responses, offline/runner failures, forms/loading/empty/error states, navigation, chat/files/approvals/settings and cleanup. Read Solid 2/mobile/browser skills and API contract. Fix reproducible defects with focused regression evidence using existing kit and Appearance tokens; no independent redesign or shared package edits. Raise backend findings to PM/owner rather than editing backend. Browser availability previously empty; check once and disclose remaining gap.

## Validation

Confirm each bug with a failing regression or precise reproduction before fixing. Preserve API contracts, security/privacy and existing UI kit. Role suites, root lint/typecheck/format/architecture, affected builds, isolated database/contract tests, independent review and exact commit evidence. No tests on live API 4000 or live chat database. No paid agent turns, production billing changes, repository access expansion or security checks disabled. Browser validation only via available approved browser surface; record if unavailable.

## Resolution

Claimed before implementation. Base main `353da67ef5f8bc02aa74e67a0cfc32ffd646f315`. User requested marking merged cards done and an application-wide reliability audit/fixes. PM owns board only; separate backend/web owners share this atomic worktree with disjoint application paths; reviewer read-only. Tailscale/private monitoring, PGlite and new features remain deferred. Fix confirmed bugs, avoid speculative refactors; report any residual issue with evidence rather than claiming the whole app bug-free. Delivery is reviewed fixes and PR; no new application merge/restart inferred.


## Implementation and reviewer evidence

Web owner froze 27 Console paths after focused regressions, Console lint/typecheck, formatting, architecture and naming checks passed. Prior-account request replay, late login after logout, stale thread reload and in-flight note listing regressions failed before their fixes. Shared stores reset on account changes and drop late reads/mutations; provider metadata uses account-scoped IndexedDB without migrating unowned global cache. File/chat route memories scope account and workspace and ignore legacy global paths/IDs. Disposed provider cache regressions actually mount providers, begin deferred network reads, dispose/change account, resolve the old read and verify no new-account cache write.

Cookie issuers/logout run in order with 30-second abort bounds; logout captures bearer proof before clearing client state and queues server logout before awaiting IndexedDB cleanup. Slow save preserves newly typed text and advances the saved base; late file/read/save/list responses invalidate after file, project, account or runner placement changes. Note network/cache hydration preserves concurrent mutations; delayed saves cannot write into another account.

Focused runs passed (not summed): core 45 tests/9 files; auth/file boundary 34/4; final transport/placement 19/2; private memories/Files/AppShell 35/3; disposed-account caches/shared stores 7/3. The cross-store test moved under the auth module to preserve deep-import boundaries. Marketing source review found no confirmed actionable defect and apps/web is unchanged. Browser inventory was empty; no walkthrough is claimed. Independent frozen-diff review approved for commit. Root full Console/build and exact-head review follow.


Final role suites: Console 637/637 across 113 files with two workers; runner 451/451 across 61 files, including all three new lifecycle regressions; API 57/57; black-box API contracts 80/80. Web 31/31, database 6/6, logger 3/3 and Rust lint/test passed. All test databases/servers were disposable and isolated from live port 4000 and the live chat database. Frozen implementation has independent reviewer approval with no unresolved code findings; committed-head review and PR CI will be recorded on the PR. Browser and security configuration remain separate open follow-ups.


## Closed

Merged to main in shabirkhan-dev/grid#177 (squash `e4583d1`, 2026-10-06). Work found later in stashes from those worktrees was reviewed and landed in shabirkhan-dev/grid#180 (`18f2ad8`). Browser verification stays open on `2026-10-06-browser-verification.md`.
