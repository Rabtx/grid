---
id: grid-reliability-backend
title: backend and ci reliability audit and fixes
type: bug
from: human
to: backend
priority: high
status: doing
assignee: reliability_backend
reviewer: reliability_review
parent: 2026-10-06-grid-reliability.md
depends_on: []
branch: agent/backend/reliability-audit
worktree: /home/ghost/Projects/grid-worktrees/agent/backend/reliability-audit
scope: [apps/api/**, packages/db/**, apps/runner/**, apps/launcher/**]
allowed_shared: [.agents/board/**, apps/docs/content/docs/backend-api.mdx, .github/workflows/ci.yml, .github/workflows/security.yml, .github/workflows/cd.yml]
created: 2026-10-06
updated: 2026-10-06
---

## What

Audit API/runner/launcher/database behavior for real reliability and isolation bugs. Fix the known billing test dependency on demo@grid.dev using isolated owned fixtures. Diagnose security workflow permission/support failures without weakening checks or purchasing features. This user-authorized application-wide pass explicitly assigns CI workflow fixes as shared scope to backend. Inspect request failures, resource cleanup, auth and project boundaries, session/job scheduling and persistence; fix confirmed actionable defects with regression evidence. Notify PM of findings and exact changed paths; keep frontend untouched.

## Validation

Confirm each bug with a failing regression or precise reproduction before fixing. Preserve API contracts, security/privacy and existing UI kit. Role suites, root lint/typecheck/format/architecture, affected builds, isolated database/contract tests, independent review and exact commit evidence. No tests on live API 4000 or live chat database. No paid agent turns, production billing changes, repository access expansion or security checks disabled. Browser validation only via available approved browser surface; record if unavailable.

## Resolution

Claimed before implementation. Base main `353da67ef5f8bc02aa74e67a0cfc32ffd646f315`. User requested marking merged cards done and an application-wide reliability audit/fixes. PM owns board only; separate backend/web owners share this atomic worktree with disjoint application paths; reviewer read-only. Tailscale/private monitoring, PGlite and new features remain deferred. Fix confirmed bugs, avoid speculative refactors; report any residual issue with evidence rather than claiming the whole app bug-free. Delivery is reviewed fixes and PR; no new application merge/restart inferred.


Additional approved audit scope: CD quality-gate declares DATABASE_URL but has no PostgreSQL service or migration, unlike CI. Diagnose/fix the isolated release-test database prerequisites in `.github/workflows/cd.yml`; preserve staging/production deploy hooks, required secrets, protected environments and health gates unchanged.


## Implementation and reviewer evidence

Backend owner froze the final patch. Billing fixtures now own UUID users/workspaces/membership/subscription rows with cleanup; 14/14 passed twice against fresh migrated unseeded PostgreSQL and no fixture rows remained. File attribution listing/content/blame reproductions demonstrated foreign workspace session metadata before the scoped query; same-workspace attribution remains covered with a real session fixture. Operate rejects inherited/invalid folder entries in selection, inheritance and polling. Automation test now checks exactly two concurrent starts independent of creation/update order.

OTP/MFA simultaneous wrong-code regressions recorded one attempt for five guesses before the atomic SQL update; now each wrong guess counts and the limit consumes the challenge permanently. Logout accepts only signed, unexpired own-session bearer proof to revoke despite cookie rotation, preserving cookie/native compatibility; forged/foreign subjects and concurrent rotation/revocation are covered. Final API suite 57/57 and API contracts 80/80 passed.

Terminal/chat/relay closed-during-auth regressions failed 3/3 without the readyState guard and passed 3/3 with it; existing hello tests 3/3 passed. Runner lint/typecheck passed with existing warnings. Full runner rerun follows. CD quality gate now has isolated PostgreSQL 16 plus migrations; staging/production deployment jobs were verified identical to base. Security checks remain enabled; private-repository feature availability is tracked separately. Independent frozen-diff review approved for commit; exact-head validation follows.


Final role suites: Console 637/637 across 113 files with two workers; runner 451/451 across 61 files, including all three new lifecycle regressions; API 57/57; black-box API contracts 80/80. Web 31/31, database 6/6, logger 3/3 and Rust lint/test passed. All test databases/servers were disposable and isolated from live port 4000 and the live chat database. Frozen implementation has independent reviewer approval with no unresolved code findings; committed-head review and PR CI will be recorded on the PR. Browser and security configuration remain separate open follow-ups.
