---
id: grid-icons-on-demand
title: load the icon set with the screens that draw it
type: perf
from: pm
to: frontend
priority: low
status: done
assignee: claude
reviewer: human
parent: grid-console-initial-bundle
depends_on: []
branch: none
worktree: none
scope: [apps/console/src/kit/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

After #206, the kit's icon module (about 50 KB with the Hugeicons data) was still in the first load in full. Every icon any screen used was wrapped in one module, so all of them came with the shell.

## Validation

- Measure the first load before and after.

## Resolution
Done by claude, 2026-10-07.

- **The change:** each named icon is now its own module (`kit/glyphs/*.tsx`, 78 of them), with the renderer in `kit/icon.tsx`. `kit/icons.tsx` re-exports them, so no import changed. A screen now brings the icons it draws.
- **Measured first load** (entry plus modulepreloads, built `index.html`), against the deployed `9552f23` build:

  | | before | after |
  |---|---:|---:|
  | files | 33 | 55 |
  | raw | 443.6 KB | 429.4 KB (−14 KB) |
  | gzip | 147.1 KB | 148.9 KB (+1.7 KB) |

  About 20 KB of icon data moved out of the first load; the roughly 43 KB left are icons the shell itself draws.
- **Gzip didn't improve:** Rolldown (Vite 8) emits icons that several chunks share as small chunks of their own. It has no automatic small-chunk merging, and a manual icon group would just put every icon back into the first load. The gain is less code to parse on start, and new icons no longer grow the first load.
- **Checks:** console 713 / 713, typecheck, lint, naming and architecture checks pass. No exports went missing (compared against the old module's export list).
