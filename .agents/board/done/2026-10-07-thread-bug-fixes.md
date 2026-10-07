---
id: grid-thread-bug-fixes
title: land the fixes from the find critical bugs thread
type: bug
from: pm
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/api/src/**, apps/runner/src/connectors/**, apps/runner/src/chat/hub.test.ts]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The Grid thread "Find critical bugs" (opencode, 2026-10-07) found and fixed six defects, then left them uncommitted in its worktree (`grid/chat-ff2217c0`). They need review and a merge.

## Validation

- A review of each fix; tests that fail before and pass after; the affected suites.

## Resolution
Landed by claude (pm review), 2026-10-07. The fixes are the thread's; each was reviewed against the code, carried from its worktree onto current `main`, and tested.

1. **A workspace could lose its last owner.** `updateMember` checked the role asked for, but wrote `member` whenever a custom role was given. `{"role":"owner","customRole":"reviewer"}` from the sole owner passed the check and left no owner. The check now uses the role actually written. New PGlite `workspaces/service.test.ts` (added in review) fails on `main` and passes here.
2. **Viewers could fill the disk with logos.** The permission check ran after `Bun.write`. `assertCanSetLogo` now runs before anything is written; tested in the same file.
3. **Every workspace logo 404'd.** `/uploads/logos/` wasn't in the allowlist. It's allowed now. SVGs are served with a sandboxing CSP, and review added `nosniff` to every upload. Thread test: `profiles/routes.test.ts`.
4. **Title-only search results had blank previews** (`Math.min()` of nothing is `Infinity`). Thread test: `projects/search.test.ts`.
5. **Connector activity lost the last call.** The record was fire-and-forget after the reply, so it was lost when the agent ended its turn on the answer. It's now awaited before the reply is written, and blocked/denied are awaited too. Thread test in `connectors.test.ts`.
6. **`hub.test.ts` race** (intermittent 5 s timeout): `finish` now waits for the ask.
7. **Fixed in review, flagged by the thread:** the nightly backup tick listed backups outside its `try`, so a dump vanishing mid-scan rejected unhandled. It's inside the `try` now.

**Filed:** `first-workspace-race`, the read-then-write in `createPersonalWorkspace`. It needs a decision on uniqueness and retries.

**Checks:** API 40 / 40 (on PGlite, no `DATABASE_URL`), runner 509 / 509, typecheck and lint pass.
