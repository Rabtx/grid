---
id: str-figma-pulse
title: Home → Pulse from Figma 07 — the company at a glance, from real data
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-connectors]
branch: agent/web/figma-pulse
worktree: none
scope:
  - apps/runner/src/pulse/**
  - apps/runner/src/connectors/catalog.ts
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
  - apps/api/src/modules/workspaces/schema.ts
  - apps/api/src/modules/workspaces/service.ts
  - packages/db/src/schema/workspaces.schema.ts
  - apps/console/src/modules/home/**
  - apps/console/src/modules/workspaces/types/workspace.types.ts
  - apps/console/src/kit/metric.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/app.tsx
created: 2026-10-04
updated: 2026-10-04
---

## What

Figma "07 · Home → Pulse", desktop and phone: MRR, active users, activation and error rate with
their bars, Shipping, Runway, Worth knowing, a period (7/30/90 days) and Draft investor update.

## Scope

Nothing on the page is made up. **Shipping** comes straight from GitHub (`gh`). **Runway** comes
from cash and monthly costs entered by an admin, against MRR. **MRR, active users, activation,
error rate and Worth knowing** are read by an agent from the connected Stripe, PostHog and Sentry
(their MCP tools differ and change; an agent reads their schemas and adapts), in a thread anyone
can open, once a day or on demand; its answer is checked against a fixed shape before it is shown.
A service not connected shows "Connect" on its card. **Left for later:** "AI models" spend from
Grid's own agent costs (entered by hand for now).

## Resolution

**Runner** (`pulse/`) — `shipping.ts`: merged pull requests (`gh pr list --search merged:>=`),
deploys (`gh api …/deployments`), median lead time, agents vs people (Grid's thread branches, agent
branch names, "Generated with…"/"Co-Authored-By" signatures, bots). `reading.ts`: the prompt
(only the connected services, read-only) and a strict parser. `service.ts`: picks the workspace's
default agent when it takes connectors, runs it as an automation-style thread
("Pulse · the last 30 days"), stops it after ten minutes, keeps a snapshot per period; a stale one
(a day) is read again when Pulse opens. `GET /pulse?days=`, `POST /pulse/refresh` (start agents).
Catalog: Stripe's `stripe_api_read`/`stripe_analytics` and PostHog's `execute-sql`/`query-*`/
`*-get-*` count as reading, so a reading never stops to ask; `stripe_api_write` is never.

**API** — workspace settings take `finance` (currency, cash, monthly costs); PATCH merges it.

**Console** — `/home/pulse`; Home's panel lists Today and Pulse, phones get Today | Pulse tabs.
Kit: `MetricCard`, `Bars`, `MetricGrid`, `Figures`, `SplitBar`, `AmountRow`. Runway dialog
(admins). Draft investor update leaves the period's numbers as a draft in a new thread.

## Validation

- `bun run lint` 0, typecheck per package 0, `bun run architecture:check` OK, `vite build` OK.
- Console vitest 570 (new: pulse maths ×3, Pulse screen).
- Runner 397 (new: shipping counts and agent detection, the prompt, the parser, the last answer,
  a full reading by a fake agent into a snapshot and its thread).
- Chromium on this branch with real GitHub data: 110 deploys, 157 PRs merged (157 by agents),
  6m lead time over 30 days; Runway set up through the dialog (14 months at $1,020 a month);
  cards for unconnected services say Connect; phone layout with tabs.
