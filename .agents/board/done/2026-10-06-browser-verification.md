---
id: grid-browser-verification
title: desktop and phone verification for operate and reliability fixes
type: bug
from: human
to: qa
priority: high
status: done
assignee: claude
reviewer: reliability_review
parent: 2026-10-06-grid-reliability.md
depends_on: []
branch: agent/backend/reliability-audit
worktree: /home/ghost/Projects/grid-worktrees/agent/backend/reliability-audit
scope: []
allowed_shared: []
created: 2026-10-06
updated: 2026-10-06
---

## What

Follow-up for merged Operate health/logs/costs browser walkthrough: signed-in desktop and phone, permissions, add/remove controls, polling/tab cleanup, error/empty/truncated states and no horizontal overflow. Include reliability changes: account switch clears cached data/routing, logout during sign-in/refresh stays signed out after reload, and typing during a slow file save preserves the newer draft. Existing unit/full tests and HTTP checks passed, but browser surfaces were unavailable. Do not report this verification complete until it is actually performed; no paid agent runs or production data mutations.

## Validation

Confirm each bug with a failing regression or precise reproduction before fixing. Preserve API contracts, security/privacy and existing UI kit. Role suites, root lint/typecheck/format/architecture, affected builds, isolated database/contract tests, independent review and exact commit evidence. No tests on live API 4000 or live chat database. No paid agent turns, production billing changes, repository access expansion or security checks disabled. Browser validation only via available approved browser surface; record if unavailable.

## Resolution

Claimed before implementation. Base main `353da67ef5f8bc02aa74e67a0cfc32ffd646f315`. User requested marking merged cards done and an application-wide reliability audit/fixes. PM owns board only; separate backend/web owners share this atomic worktree with disjoint application paths; reviewer read-only. Tailscale/private monitoring, PGlite and new features remain deferred. Fix confirmed bugs, avoid speculative refactors; report any residual issue with evidence rather than claiming the whole app bug-free. Delivery is reviewed fixes and PR; no new application merge/restart inferred.

### Verified in the browser by claude, 2026-10-07

Main at `6a937ae`. Ran against an isolated runner (:4199, scratch data, scratch projects folder) and the console dev server (:3023), signed in as the seeded demo account. Desktop at about 750 px wide, phone at 375×812. No live data or paid agent runs were touched.

**Operate**
- **Health:** the empty state shows. Added a monitor (`https://example.com/`); the dialog closed and the service card showed its waiting state. "Stop monitoring" asks to confirm, then returns to the empty state.
- **Polling:** 3 reads in 65 s on Health (the first load plus polls at 30 and 60 s), and 0 in 35 s after leaving. The interval is cleared on leave.
- **Logs:** added `logs/server.log` (3,000 lines with fake `token=` values). Tokens were redacted, and "Showing the latest bounded tail / Earlier lines or bytes were omitted" appeared. "Remove log source" asks to confirm, removes the source, and says the log file stays.
- **Bug found and fixed:** the tail showed "1 lines". Redacting a `token=` value swallowed the newline and the next line's timestamp. Fixed in #209, with a regression test.
- **Costs:** the unknown and empty states show. Recorded a $12.34 charge; deleting it asks to confirm, then returns to empty.
- **Error state:** with the runner stopped, Refresh clears the old data and shows "The runner is not running" with Try again and the reconnecting banner. After restarting the runner, Try again recovers.
- **Phone, 375 px:** Health, Logs and Costs all have `scrollWidth` 375 with no overflowing elements. The log source and the monitor were both removed on the phone.

**Reliability**
- **Slow save:** saved with the request held for 3 s and typed during it. The editor kept "first edit second edit" and stayed "Unsaved changes", and the disk held only "first edit". The next save used the new base hash, with no false conflict; the disk then held both edits and the panel was clean.
- **Logout during refresh:** forced a 401 and held the refresh response 4 s after the server answered 200, then signed out from the account menu. Logout went out once the refresh settled and the page went to login. After a reload it was still on login, and the refresh was refused (403).
- **Not verified in the browser:**
  - Account switching needs a second account, which would add one to the dev database the owner had just cleaned. It's covered by `account-stores`, `account-cache` and `account-storage` tests.
  - Logging out *during* sign-in has no UI path (no sign-out control on the login screen). It's covered by `auth-context.test.tsx` ("does not accept a sign-in that finishes after logout").
- **Permission checks:** not verified in the browser. They need a member or viewer account, and are covered by `telemetry.test.ts` ("respects custom production permissions").

**Minor findings:** moved to `2026-10-07-operate-profile-polish`.
