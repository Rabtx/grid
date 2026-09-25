---
id: str-local-first
title: Keep chats, terminal screens and lists on the device, so the app shows them at once
type: feature
from: human
to: web
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: [str-resume-deltas, str-runner-link]
branch: agent/web/local-first
worktree: ../grid-worktrees/agent/web/local-first
scope:
  - apps/console/src/lib/local-store.ts
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/terminal/**
  - apps/console/src/modules/environments/stores/**
  - apps/console/src/modules/auth/context/auth-context.tsx
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Nothing was kept on the device, so after the phone closed the app, every chat and terminal
waited for the network before showing anything.

## Proposal or Ask

Keep the following in IndexedDB, built into the browser with no dependency:
- each chat's events and its catch-up cursor;
- each terminal's recent screen and byte offset;
- thread lists, environments and project placements.

Show them first, then connect from where the device got to, so the runner sends only what is
new. The data is per account and wiped on sign-out.

## Validation

- Console, `bun x vitest run`: 213 passed, 3 of them new for the screen cache: round trip with
  its offset, trimming past 256 KB, and forgetting a closed terminal.
- In a real browser (Grid's own origin), the IndexedDB layer:
  - round-tripped terminal bytes and a chat with its cursor;
  - wrote nothing without a signed-in user;
  - kept accounts apart;
  - cleaned up.
- `tsc` and oxlint: clean.

## Resolution

- **`lib/local-store.ts`:** keys scoped by user id; `setUser` on sign-in, `clear` on sign-out;
  `saveSoon` writes the latest value at most once per interval, and flushes when the page is
  hidden.
- **Chats:** the conversation shows the kept transcript, then connects with the kept cursor.
  The transcript is saved as events arrive.
- **Terminals:** `screen-cache.ts` preloads screens with the terminal list. A view draws its
  kept screen and connects with the kept offset. Output is recorded, trimmed to 256 KB, and
  saved when the page is hidden. A closed terminal is forgotten.
- **Thread lists, environments and placements:** the kept copy is shown first, and the
  runner's answer replaces it.
