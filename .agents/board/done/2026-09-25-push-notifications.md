---
id: str-push-notifications
title: Notify the person's devices when an agent finishes or needs approval while they are away
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: [str-resilient-connection]
branch: agent/backend/push-notifications
worktree: ../grid-worktrees/agent/backend/push-notifications
scope:
  - apps/runner/src/push/**
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/chat.test.ts
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
allowed_shared:
  - apps/console/src/pwa/service-worker.js
  - apps/console/src/modules/settings/**
  - apps/console/src/modules/chat/lib/chat-socket.ts
  - apps/console/src/modules/chat/lib/chat-socket.test.ts
  - apps/console/src/modules/chat/components/conversation.tsx
created: 2026-09-25
updated: 2026-09-25
---

## What

Phones pause a backgrounded web app and drop its sockets, and no web API prevents that. Native
apps rely on push notifications instead of a live connection. Grid should do the same: tell the
person's devices when an agent finishes or waits for approval while nobody is looking.

## Why / Context

The agent keeps working on the runner while the app is in the background, but until now the
person only found out by opening the app again.

## Proposal or Ask

Web Push from the runner, with no new dependency: WebCrypto encryption (RFC 8291) and VAPID
signing (RFC 8292). A chat socket reports whether its page is visible, and a push is sent only
when no device is looking at that chat.

## Scope

**In scope:** runner push module and routes, the chat hub's attention hook, the service worker's
push handlers, and the Notifications card in Settings → Agents.

**Out of scope:** terminal notifications (for example, a long command finishing).

## Validation

- Runner, `bun test`: 65 passed. The encryption matches RFC 8291's worked example byte for
  byte, and the VAPID JWT verifies.
- Console, `bun x vitest run`: 202 passed. `bun run build` emits the push handlers into `sw.js`.
- `bun run typecheck`, `bun run lint`, `bun run architecture:check`: pass.

## Resolution

**Runner (`src/push/`):**

- The VAPID key is made once and kept in `chat.db`.
- Routes: `GET /push/key`, `POST`/`DELETE /push/subscriptions`, and `POST /push/test`.
- The runner only posts to the browsers' push services (Google, Apple, Mozilla, Microsoft).
- A subscription the browser has dropped is forgotten automatically.

**Chat hub:** `onUnwatchedAttention` fires on `turn_end` (done or error) or `approval` when no
attached device is watching that chat.

**Console:**

- The service worker shows the notification; tapping it opens that chat.
- Settings → Agents has a Notifications switch and a "Send a test" button.
- On iPhone and iPad the card explains that Grid must be added to the Home Screen first.
