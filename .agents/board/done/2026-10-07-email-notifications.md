---
id: grid-email-notifications
title: stop offering email notifications that are never sent
type: bug
from: pm
to: web
priority: normal
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/console/src/modules/settings/**, apps/runner/src/prefs/**, apps/runner/src/push/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

Settings → Notifications offers an Email channel (`notifications-screen.tsx:86`), but the runner's notifier only filters push subscriptions by desktop or phone (`push/notifier.ts:408-409`), and the runner has no email sender.

## Proposal or Ask

Remove the Email channel until a sender exists (the house rule is no controls that do nothing). Tests.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution
Fixed by claude, 2026-10-07. Removed the Email notification channel and the "Morning email digest"
setting, because the runner has no way to send email and both did nothing. Removed in
`apps/runner/src/prefs/store.ts`, `prefs/routes.ts`, the console's `account.service.ts` and
`notifications-screen.tsx`, and the test fixtures. Prefs that older runners saved with `email` or
`digest` still load, with those fields dropped (new test in `prefs.test.ts`). The console test
asserts neither appears. Runner 487 / 487, console 702 / 702, lint passes. If email notifications
are wanted later, the API already sends email through Resend (`apps/api/src/modules/email`), and
the runner could ask it to.
