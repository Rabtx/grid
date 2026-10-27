---
id: grid-accountability-phase-eight
title: accountability — audit log, scoped agent keys, workspace spending limits
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-reliability-phase-seven
depends_on: []
branch: ccr-9c1ba5cb-8vmqkv
worktree: none
scope: [apps/runner/src/**, apps/console/**, apps/docs/content/docs/backend-api.mdx, CHANGELOG.md]
allowed_shared: []
created: 2026-10-27
updated: 2026-10-27
---

## What

The owner's picks F1–F3: an audit log of what agent keys, guests, webhooks, automations and
spending limits do (F1); agent keys that expire, are kept to some projects, see only their own
threads and have a budget (F2); daily and monthly spending limits for the workspace, a person, a
project or an automation, warning at 80% and stopping work at 100% (F3).

## Why / Context

Phase six let agents outside Grid, guests and webhooks into a workspace. Teams need to see what
they did, narrow what a key may do, and know agents cannot spend without limit.

## Proposal or Ask

Done when each works end to end in the console against the real runner, with tests, and the API
contract documents the new routes and fields.

## Scope

**In scope:** the paths above. Spending is what agents report (`usage.costUsd`); agents that report
none count as nothing. Periods are UTC.

## Evidence

- `bun test` in apps/runner: 640 pass, among them `spend.test.ts` (the ledger's rises and resets,
  totals and breakdowns; budgets' validation, scopes, 80% and 100% notices once a period, stopping
  and refusing, the next period, changes), `audit.test.ts` (paging, filters, pruning, owners and
  admins only, costs; spending routes), scoped keys and the turn gate in `outside-agents.test.ts`,
  guest and webhook entries.
- `vitest run` in apps/console: 777 pass (key limits and audit actions in words, dollars).
- `bun run test:e2e:console`: 9 pass against the real API and runner: a key made with an expiry,
  a budget and own-threads only; a daily workspace budget of $1 set in Settings → Spending, a
  thread that reported $2, the next message refused saying the budget is used up, the Inbox item,
  the budget shown as used up and then removed; the audit log listing the key, guest, webhook and
  limit entries and filtering to guests (which found a filter bug, fixed).
