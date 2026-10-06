---
id: grid-operate-logs-costs
title: operate project logs and reported costs
type: feature
from: human
to: web
priority: high
status: done
assignee: operate_logs_web
reviewer: operate_logs_review
parent: none
depends_on: []
branch: agent/web/operate-logs-costs
worktree: /home/ghost/Projects/grid-worktrees/agent/web/operate-logs-costs
scope: [apps/console/**]
allowed_shared: [.agents/board/**, apps/docs/content/docs/backend-api.mdx]
created: 2026-10-06
updated: 2026-10-06
---

## What

Extend Operate with real project log tails and reported costs after the user approved the next slice in this chat. Root coordinates as PM; separate web/backend owners share this atomic branch with disjoint scopes.

## Acceptance

Logs: production-permitted roles may register up to 20 named project-relative .log files, list/remove sources, and read a bounded latest tail. Paths stay inside the linked project, including opened-file validation and symlink defenses; refuse hidden/credential files, traversal, nonregular files and binary data. Strip terminal controls and common credential values before returning; no log text persisted or forwarded to diagnostics. Explicit missing/empty/permission/error states. No arbitrary shell execution or global machine logs.

Costs: actual provider-reported session cost maxima from existing usage metadata, grouped by provider across retained project conversations, with reported/total coverage and null for missing costs. No token-to-money estimates, cumulative-counter double counting or chat payload extraction. Admins with production permission may record/delete hosting charges in USD cents, with service/provider/date. Clearly label manually recorded hosting charges and their scope; bounded 500 records, reject overflow rather than deleting financial records. No assumed provider billing, currency conversion or fake zero totals.

All reads/writes authenticated and workspace/project scoped; mutations and sensitive log reads use existing production permission. Poll only active logs, reject stale cross-account/project/placement responses; existing health behavior unchanged. Reuse the existing Operate/Ship kit composition and Appearance tokens. Cloud log/billing adapters require the real provider information requested asynchronously from the user. Do not invent endpoints or credentials; monitoring configuration waits for supplied production URLs.

## Validation

Lifecycle/auth/isolation/persistence/path-race/bounded-read/redaction/cost aggregation tests. Full runner and Console suites, lint/typecheck/build, repository format/architecture, kit guard, independent review. Desktop/phone browser walkthrough if a browser becomes available; otherwise preserve that limitation and publish a draft. Preview ports 3024/4124; no contract tests on live port 4000. User approval is for implementation and PR delivery; do not infer a merge request for this next PR.

## Resolution

Claimed before implementation. Base main ddb51d667bfe5848fe7181a1aed764ef33be3e28. Existing live ports and project databases remain untouched. Production URL/provider details requested; independent work continues on the reusable sources and UI.


Implementation and draft-delivery evidence (2026-10-06):

- Separate backend/web owners completed this atomic slice; PM coordinated and recorded evidence. Independent reviewer `operate_logs_review` approved the final uncommitted code with no remaining code findings; exact committed-head confirmation follows hooks.
- Full runner serial suite: 445/445 tests, 59 files, 1673 assertions (`/tmp/grid-operate-logs-costs-runner-serial.log`). Focused telemetry 16/16 with 94 assertions (`/tmp/grid-operate-logs-costs-telemetry-tests.log`).
- Full Console serial suite: 614/614 tests, 106 files (`/tmp/grid-operate-next-console-tests-serial.log`). Focused feature + kit guard 29/29; independent final UI/money 19/19. Repository lint/typecheck/architecture/full workspace build passed. Standard repository format passed; final Console build and commit hooks verify the final UI refinements.
- Initial concurrent runs had an unchanged ChatHub timeout and a killed Console home-test worker. Serial full reruns passed without changes to those tests or modules.
- Review fixed the long single-line bounded-tail empty message and invalidated old mutations across A-to-B-to-A or unmount. Backend validates C1 controls, nonfinite/overflow costs, descriptor races and nonregular files.
- Isolated preview at http://10.59.31.190:3024/demo/operate/grid (runner 4124, temporary database). HTTP page/health 200; unauthenticated logs/costs 401 through runner/proxy. Actual preview runner log is registered as `Preview runner`; absent agent/hosting costs remain null. No synthetic cost entries, live chat copy or production monitor registration.
- Logs require Linux opened-descriptor validation and fail closed elsewhere; common credential redaction is best effort. The UI and API documentation disclose both limitations. Costs are retained-session provider-reported maxima and explicit manual USD hosting charges, with coverage and unknown/zero distinctions.
- Browser surfaces unavailable (`cua.getState`: no apps/browsers); desktop/phone walkthrough remains outstanding. Production health URLs and cloud log/billing provider details have not been supplied. No assumed endpoints, adapters or credentials.
- Keep card doing and publish a draft pending browser validation and actual GitHub checks. Previous main has disclosed billing-fixture/security-configuration CI issues; do not claim new-head CI green. No merge/restart of this next PR is authorized in this slice.


Draft PR: https://github.com/shabirkhan-dev/grid/pull/176. Feature commit `d8190150cfa1f057af28adbccf8867a7d5600d82` independently approved by `operate_logs_review` after all enabled hooks passed; tree clean. Reviewer reran telemetry 16/16 (94 assertions) after generated dummy-fixture cleanup; secret scan passed without exemptions or hook changes. Final Console build passed (`/tmp/grid-operate-next-console-build-final.log`). Initial GitHub snapshot: open, draft, mergeable; lint/typecheck/CodeQL in progress and dependency review queued, not yet green. This subsequent change records evidence only; implementation is unchanged. Browser walkthrough still outstanding, so card remains doing and PR remains draft/unmerged.


Closed 2026-10-06 at the owner's explicit request: implementation merged in PR #176 as `353da67`. CI fixture/security configuration and remaining browser verification are tracked separately in the reliability and browser follow-up cards; they do not reopen the delivered feature. Live services are verified on PR #176 merge commit `353da67ef5f8bc02aa74e67a0cfc32ffd646f315`.
