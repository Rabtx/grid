---
id: str-instant-start
title: Open straight into your Grid while the session is confirmed, offline included
type: feature
from: human
to: web
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: [str-local-first]
branch: agent/web/instant-start
worktree: ../grid-worktrees/agent/web/instant-start
scope:
  - apps/console/src/modules/auth/context/**
  - apps/console/src/routes/require-auth.tsx
  - apps/console/src/modules/projects/context/workspace-context.tsx
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/terminal/components/terminal-screen.tsx
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

A cold start showed nothing until the session was confirmed with the API. Offline, it sent a
signed-in person to the login page.

## Proposal or Ask

Remember who was signed in on this device: who they are, never a token. On opening:
- show their Grid from what the device kept, straight away;
- confirm the session in the background;
- connect chats and terminals once it is confirmed;
- if the session is over, go to the login page as before;
- while offline, keep the kept Grid up and retry every 10 seconds.

## Validation

- Console, `bun x vitest run`: 216 passed, 3 of them new for startup:
  - a known account is shown at once and then carries on;
  - an expired session drops the account from the device;
  - offline, the app stays in the kept Grid and connects once the API is back.
- `tsc` and oxlint: clean.

## Resolution

**Auth:**
- `restoring()` and `waitForToken()` on the auth state.
- `grid.session.user` in localStorage (who, not a token), set on sign-in and removed when the
  session ends.
- Retries every 10 seconds while unreachable.

**Routes:** `RequireAuth` renders while restoring, and redirects only once the session is known
to be over.

**Kept copies:** projects, folder links and tasks are kept on the device. Conversations and
the terminal list wait for the confirmed session before connecting.
