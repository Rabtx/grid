---
id: str-home-today
title: Home — Today, the first screen of the day
type: feature
from: human
to: web
priority: high
status: doing
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

