---
id: str-model-picker-redesign
title: A cleaner model picker — named agent chips, one-line model rows, provider headings
type: feature
from: human
to: ui-ux
priority: normal
status: done
assignee: ui-ux
reviewer: none
parent: none
depends_on: []
branch: ccr-78b19f86-o8youq
worktree: /home/user/grid (cloud session; the session's designated branch)
scope: [apps/console/src/kit/picker.tsx, apps/console/src/kit/avatar.tsx, apps/console/src/modules/chat/components/pickers.tsx, apps/console/src/modules/chat/lib/choices.ts, apps/console/src/routes/**, DESIGN.md]
allowed_shared: [apps/console/** (requested by the human)]
created: 2026-11-03
updated: 2026-11-03
---

## What

Before: an unlabelled icon rail of agents ("CU", "GR"), two-line rows each with the same layers
tile (orange when chosen), a boxed search, raw provider ids as headings, a star and a radio on
every phone row, four models visible. After: named agent chips with a sign-in dot, a search line,
one `h-row` line per model (star slot, name, note, Free badge, context size, accent check), provider
names with counts, twice the models visible. Cursor and Grok get marks.

## Validation

- Console vitest 820/820 (kit guard, tokens, picker, choices), typecheck, oxlint.
- Screenshots on `/design` (new Model picker specimen): desktop dark/light, phone dark, search.

## Resolution

Done on `ccr-78b19f86-o8youq`; documented in DESIGN.md ("The model picker is a list, not cards").
