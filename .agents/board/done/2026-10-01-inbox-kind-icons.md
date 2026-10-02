---
id: str-inbox-kind-icons
title: Share the inbox kind icons between Inbox and Home
type: chore
from: web
to: web
priority: low
status: done
assignee: none
reviewer: none
parent: none
depends_on: [str-home-today]
branch: none
worktree: none
scope:
  - apps/console/src/modules/inbox/**
  - apps/console/src/modules/home/components/home-screen.tsx
allowed_shared: []
created: 2026-10-01
updated: 2026-10-01
---

## What

The icon per inbox kind (approval, turn done, turn failed, review, failing checks) is defined in
`inbox-screen.tsx` and copied in `home-screen.tsx`. Export it once from the inbox module.

## Why / Context

Raised in review of `2026-10-01-home-today.md`: two copies drift the first time a kind is added.
The inbox module was outside that card's scope.

## Proposal or Ask

Export `KIND_ICONS` (or an `InboxKindIcon` component) from `@/modules/inbox` and use it in both
screens. Done when one definition remains and both screens' tests pass.

## Scope

**In scope:**

- the paths in `scope` above

**Out of scope:**

- Any change to how inbox items are read or marked

## Validation

- `bun --cwd=apps/console run typecheck`, `lint`, `test`

## Resolution

Resolved on agent/web/figma-home: the inbox kind looks live in `modules/inbox/lib/kinds.tsx`, exported as `INBOX_KINDS`; the Inbox and Home both use it.
