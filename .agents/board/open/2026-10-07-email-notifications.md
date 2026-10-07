---
id: grid-email-notifications
title: stop offering email notifications that are never sent
type: bug
from: pm
to: web
priority: normal
status: open
assignee: none
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

