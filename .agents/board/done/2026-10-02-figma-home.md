---
id: str-figma-home
title: Home matches the Figma 07 Home · Today frames
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-front-door]
branch: agent/web/figma-home
worktree: none
scope:
  - apps/console/src/modules/home/**
  - apps/console/src/modules/inbox/**
  - apps/console/src/modules/shell/**
  - apps/console/src/kit/**
created: 2026-10-02
updated: 2026-10-02
---

## What

Home (the earlier home-today branch, merged in) rebuilt to Figma "Home · Today", desktop and phone.

## Scope

**Out of scope (no backend yet, so not drawn rather than faked):** Pulse (Stripe, PostHog, Sentry
metrics), Goals, Ask Grid, "Approve plan", calendar events. "Today" becomes "Scheduled": the next
automation runs.

## Resolution

**Changed** — greeting header; Needs you card (unread inbox items, tinted kind tiles, Review /
Answer / Open, link to the Inbox); Agents' plan for today (tasks in flight across projects with
the agent's logo or the person's avatar); aside: While you were away (items dealt with in the last
day) and Scheduled (next automation runs with their time). Home first on the rail; panel row with
a second line; phone header subtitle. Kit: SectionCard, CardRow (with tone tiles), DotLine,
MainAside, NavLink `detail`. Inbox kind looks shared as INBOX_KINDS (closes the inbox-kind-icons
card).

**Validation** — typecheck clean; lint 0 errors; 73 files / 483 tests; build OK; Chromium at
1440×900 and 390×844, light and dark, with seeded local inbox rows; no page errors.

**Review** — independent reviewer: 4 defects (an item in two cards, "Nothing needs you" before
knowing and "1 things", icon tile in a tile, 24:00 at midnight) and lows (breakpoint, double tab
stops, duplicate labels, no link to the Inbox, NavLink fragility, DotLine always a button). All
fixed; agent logos are still matched by owner name (tasks carry no agent id yet).
