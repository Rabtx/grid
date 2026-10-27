---
id: grid-outside-phase-six
title: grid from outside — webhook automations, outside agents and guests, replay tests, search, links and snooze
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-autonomy-phase-five
depends_on: []
branch: ccr-9c1ba5cb-8vmqkv
worktree: none
scope: [apps/runner/src/**, apps/console/src/**, apps/docs/content/docs/backend-api.mdx, CHANGELOG.md]
allowed_shared: []
created: 2026-10-27
updated: 2026-10-27
---

## What

The owner's picks M–P from the comparison with T3 Code: automations that run on a webhook (M);
agents outside Grid using it over MCP with agent keys, and guests following a shared thread (N);
tests that replay real recorded agent sessions (O); full-text search, `grid-thread://` links
between threads, and snooze (P).

## Why / Context

Grid's work was reachable only from inside Grid: an alert, another agent or a teammate without an
account had no way in. Agent-provider changes were caught only by hand-written fakes. Search
matched whole words, agents named threads in a way nobody could click, and a thread that would
take hours kept asking for attention.

## Proposal or Ask

Done when each works end to end on a local stack with real agents, with runner and console tests,
and the API contract documents the new routes, events and origins.

## Scope

**In scope:** the paths above. Webhook secrets, agent keys and guest links live in SQLite beside
the chats; keys and guest tokens are stored only as hashes. Everything outside Grid reaches the
runner through the console's `/runner` path.

## Evidence

- `bun test` in apps/runner (608 pass): `webhooks.test.ts` (signatures, tokens, delivery ids,
  filters, templates, the rate limit, secret rotation, deliveries run once, refusals);
  `replay.test.ts` (four real Claude Code sessions recorded with `GRID_AGENT_RECORD_DIR` and
  scrubbed: a plain turn, a Bash approval, an AskUserQuestion question, a resumed session, played
  back to `claudeProvider`); `outside-agents.test.ts` (keys, MCP protocol, read-only keys,
  `thread_start` once per request id, guest links' view, expiry, stop, asking, send and dismiss,
  limits); `find-and-snooze.test.ts` (prefix and accent search, workspace isolation, rename,
  delete, backfill, snooze limits and waking); webhook routes in `routes.test.ts`.
- `vitest run` in apps/console (773 pass): thread links in markdown (and in documents' own HTML),
  webhook triggers and lines, snooze times, the guest view.
- Live on a local stack: real Claude Code, given an agent key made in Settings → Agent keys and
  Grid's MCP address, started a Grid thread in demo-app, waited for it and reported its reply
  ("pong"); the thread showed "From Claude Desktop, an agent outside Grid". The thread shared from
  its menu opened on a phone-sized page with no sign-in; a guest's question showed as a card, was
  sent on and answered, and the guest saw the answer; stopping sharing ended the link. Snooze from
  the menu put a clock on the thread. A webhook automation refused an unsigned delivery, filtered
  out `level: info`, ran on a signed `level: error` delivery (the agent summarised the alert) and
  answered the same delivery again with "already ran". An agent's `grid-thread://` link opened the
  linked thread. Searching "payme" found the thread about the payments service.
