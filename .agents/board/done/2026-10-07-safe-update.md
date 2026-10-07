---
id: grid-safe-update
title: build updates beside the running version so a failed build changes nothing
type: bug
from: pm
to: devops
priority: medium
status: done
assignee: claude
reviewer: human
parent: grid-update-button
depends_on: []
branch: none
worktree: none
scope: [scripts/bash/update-grid.sh, apps/docs/content/docs/portable.mdx]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The update script (#215) built in place. Vite empties the console's build folder when it starts, so a build that failed partway left the console down until the next good update, and the console was briefly unavailable during every build.

## Validation

- Rehearse the first-time migration, a failing build and a second update.

## Resolution
Done by claude, 2026-10-07.

- **How it works now:** `update-grid.sh` builds each version in its own release (`releases/<commit>-<time>`, a worktree of `origin/main`) while the running one keeps serving. Only after install and build succeed does it repoint `serve` in a single rename and restart the units.
  - A failed step removes the half-built release, and the status says "Grid is still running <commit>".
  - The release in use and the one before it are kept; older ones are removed, and a hitch in that clean-up doesn't fail the update.
- **Shared state:** state a version needs from the one before (`apps/api/.env`, `apps/api/uploads`, `.grid`) lives in `shared/` and is linked into each release.
- **First run:** it moves the existing `serve` checkout into `releases/<commit>-before` (processes running from it keep running) and its state into `shared/`, linking back so the old version keeps finding it until the restart.
- **The units don't change:** they run from `.../serve`, which becomes the link.
- **Rehearsed** with a scratch origin, a `serve` worktree holding an API `.env` and an upload, and fake `bun`/`systemctl`:
  1. First update: migrated, `serve` pointed at v2, the `.env` and upload were intact, one restart.
  2. Failing build: `failed` at building, `serve` unchanged, half-built release removed, no restart.
  3. Next update: moved to v3, two releases kept, upload intact.
- **Checks:** ShellCheck passes. The portable docs describe the layout.
