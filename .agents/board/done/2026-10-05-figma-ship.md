---
id: str-figma-ship
title: Ship from Figma 19 — environments, promote, roll back, pipelines and previews
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/figma-ship
worktree: none
scope:
  - apps/runner/src/ship/**
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
  - apps/console/src/modules/ship/**
  - apps/console/src/kit/ship.tsx
  - apps/console/src/kit/button.tsx
  - apps/console/src/kit/icons.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/app.tsx
  - apps/console/src/routes/app-shell.tsx
  - apps/console/src/modules/shell/components/rail.tsx
  - apps/console/src/modules/shell/components/sidebar.tsx
  - apps/console/src/modules/shell/components/project-switcher.tsx
  - apps/console/src/modules/shell/components/floating.test.tsx
  - apps/console/src/modules/projects/context/workspace-context.tsx
created: 2026-10-05
updated: 2026-10-05
---

## What

Figma "19 · Ship": a project's environments, what is live and how healthy, promoting staging to
production, rolling back, the checks on main and each pull request with why one failed, and the
preview each pull request gets. Desktop and phone.

## Scope

Deploys come from GitHub's deployments, whatever posted them (Actions, Vercel, Render, Netlify);
environments a workflow deploys to show before their first deploy. Grid promotes the way the
project already deploys, worked out from its workflows — a release tag, a branch, a workflow run —
or a command a person sets per environment. Rolling back runs the old deploy's Actions job again
(or a rollback command). A promotion can be watched for 15 minutes: if the site stops answering
Grid rolls back and tells whoever promoted. Grid checks sites people look at every 5 minutes for
p95 and uptime; the error rate is Pulse's last Sentry reading. Pipelines show each check with its
time, the failed log cut down to the annotated failures, and the Grid thread fixing a pull request
(its answer, its diff, Push fix). Incidents and feature flags (Figma Incident, Rollout) come next.

## Validation

- `bun run lint`, `bun run architecture:check`, console and runner `tsc --noEmit`: clean.
- Runner tests 415 pass (11 new in `src/ship/ship.test.ts`); console 577 pass (5 new).
- Console build OK.
- Browser on test ports against this repo's real GitHub data: staging's deploy history, production
  listed from cd.yml with the promote card (v0.1.1 by tag, blocked by a failing check), main's
  checks with the failure annotations, site checks after setting staging's address, phone layouts.
