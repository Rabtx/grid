---
id: str-figma-inbox
title: Inbox matches the Figma Inbox frames
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-shell]
branch: agent/web/figma-inbox
worktree: none
scope:
  - apps/console/src/modules/inbox/**
  - apps/console/src/modules/shell/**
  - apps/console/src/kit/feed.tsx
  - apps/console/src/kit/icons.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/lib/shortcuts.ts
  - packages/tokens/src/kit.css
allowed_shared:
  - packages/tokens/src/kit.css
created: 2026-10-01
updated: 2026-10-01
---

## What

Rebuild the Inbox to the Figma frames (Inbox — Desktop/Mobile, light and dark): panel views and
projects, the day-grouped list with tinted glyph rows, and the selected item beside it.

## Why / Context

Third card of the human's request to replace the console UI with the Figma design exactly.

## Scope

**Out of scope:** the Figma question card's answer options, the "what it has done so far" log,
snooze and the phone composer dock — the runner has no data or endpoints for them yet, so they
are not drawn rather than faked.

## Validation

- Console typecheck, lint, tests, build; screenshots at 1440 and 390, light and dark.

## Resolution

**Changed**

- Shell slots `crumb`, `actions`, `subtitle`, `panel` (owner-checked clearing); the panel keeps
  the workspace switcher and swaps only its body; the drawer closes on a search change too.
- Inbox: Needs you / All activity / Done and per-project filters (`?view=`, `?project=`) in the
  panel; day-grouped list (Today / Yesterday / Earlier, DST-safe); desktop detail with Open and
  Mark done; desktop keys E (done, that item only), J/K (focus and scroll); phone segmented control,
  Refresh, Mark all done and a clearable project chip; tap opens on phones.
- Store `readItem(id)`; kit `FeedRow`, `FeedGroup`, `ToneTile`, `InfoStrip`, `ShieldIcon`; `tint-*`
  utilities matching the Figma glyph tints; shortcuts ignore key repeats and open dialogs.

**Validation** — typecheck clean; lint 0 errors; 70 files / 462 tests; build OK; Chromium at
1440×900 and 390×844 light/dark with seeded local inbox rows (seed data only in the local runner
database, not the repo). No console errors.

**Contract impact** — none (uses the existing `/inbox/read` `{ id }` body).

**Review** — independent reviewer agent: 3 high (phone actions unreachable, workspace switcher
dropped with a screen panel, no view switcher with the panel folded), 5 medium (drawer stayed
open on view links, Mark done marked a whole page, selection jumped to the top, keys fired under
overlays, list remounted on every change), lows (slot ownership, nested nav, silent unread dot,
DST, J/K focus). All fixed; the h1 now names the view rather than "Inbox, view" (left as is).
