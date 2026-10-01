---
id: str-home-today
title: Home — Today, the first screen of the day
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/home-today
worktree: cloud clone of main@5b1152a (WTP worktrees are not reachable from this session; handed back as a git bundle)
scope:
  - apps/console/src/modules/home/**
  - apps/console/src/modules/shell/components/sidebar.tsx
  - apps/console/src/app.tsx
allowed_shared: []
created: 2026-10-01
updated: 2026-10-01
---

## What

A Home page at `/home`, first in the navigation: a calm "Today" that answers "what needs me, and
what are the agents doing" across every project, from data Grid already has.

## Why / Context

Figma: Grid file `Dx4ZZ1v693wRzVDKzunhQA`, page 02 · App, section 07 · Home (Home · Today, desktop
and mobile, light and dark). Today the console opens straight into a chat; nothing gathers the
inbox, the work in flight and what runs next in one place.

## Proposal or Ask

- `/home` route and a **Home** nav item above Inbox.
- Greeting with the date and a one-line summary.
- **Needs you:** the newest unread inbox items (shared `inboxStore`), each opening its thread.
- **Moving now:** tasks in progress, in review or blocked across the workspace's projects, with
  who owns them (agent or person), each opening its task.
- **Up next:** enabled automations with their next run.
- Loading, empty, partial-failure and error states; phone layout first.

Pulse (revenue, users, errors) and the agents' daily plan need connectors and planning that do
not exist yet; they are follow-up cards, not placeholders here.

Definition of done: the page renders real data on phone and desktop, every state is reachable in
tests, and the kit guard, typecheck, lint and tests pass.

## Scope

**In scope:**

- the paths in `scope` above

**Out of scope:**

- Making Home the default landing page (`/` still opens chats) — a product decision for the human
- The rail + panel shell from the Figma file — its own card
- Pulse, connectors, agent plans — follow-up cards

## Validation

- `bun run --cwd apps/console typecheck`, `lint`, `test`
- Browser check of `/home` at 390px and 1440px, light and dark

## Resolution

Landed on `agent/web/home-today` (commits `60805d8`, `9fc423c`), waiting on the human for merge.
`/home` with Home first in the navigation; Today gathers the newest unread inbox items, the work in
flight across every project (blocked, then review/QA, then in progress, with owner) and the next
automations. Every part has loading, empty, partial-failure and error states; nothing is shown
that Grid does not actually know (Pulse and agent plans stay follow-ups, per Scope).

Changed:

- `apps/console/src/modules/home/**` (new: `lib/today.ts`, `components/home-screen.tsx`, tests)
- `apps/console/src/app.tsx` (`/home` route)
- `apps/console/src/modules/shell/components/sidebar.tsx` (Home nav item above Inbox)
- `.agents/board/open/2026-10-01-inbox-kind-icons.md` (follow-up raised in review)

Validation (run on a clone of `main@5b1152a`; WTP worktrees were not reachable from this session):

- `bun --cwd=apps/console run typecheck`: pass
- `bun --cwd=apps/console run lint`: pass, no new warnings (3 pre-existing in `login-form.tsx`, `palette.tsx`)
- `bun --cwd=apps/console run test`: 72 files, 473 tests pass (16 new in `modules/home`), kit guard included
- `bun --cwd=apps/console run build`: pass
- `bun run architecture:check`: pass; lefthook pre-commit (typecheck all apps, lint, format, secrets) pass
- Browser (Playwright, Chromium) against local API + Postgres 16 + runner + console with the seeded
  demo account: `/demo/home` at 1440×900 and 390×844, light and dark. Real data rendered (2 tasks in
  flight across Grid and Platform, empty inbox and automations states); the only console error is the
  login page's pre-existing signed-out `/auth/refresh` 401.

Contract impact: none (reads existing API and runner routes only).

Review: independent reviewer agent — changes requested on `60805d8` (error reasons dropped, false
"Nothing needs you" while the inbox loads or fails, Up next without an error boundary, missing state
tests); approved on `9fc423c`. Also fixed: a false empty state before sign-in is restored.

Commit: `60805d8`, `9fc423c`

