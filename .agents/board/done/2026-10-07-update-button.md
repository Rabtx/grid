---
id: grid-update-button
title: update grid and restart it from settings
type: feature
from: pm
to: fullstack
priority: medium
status: done
assignee: claude
reviewer: human
parent: grid-production-start
depends_on: []
branch: none
worktree: none
scope: [apps/runner/src/machine/**, apps/console/src/modules/environments/**, scripts/bash/update-grid.sh]
allowed_shared: [apps/runner/src/server.ts, apps/runner/src/main.ts]
created: 2026-10-07
updated: 2026-10-07
---

## What

Since #200 the always-on services run the built stack, so getting a new version means building and restarting by hand. The owner asked for a button in Grid that does it.

## Validation

- The script tested end to end (success and failure); runner and console tests.

## Resolution
Done by claude, 2026-10-07.

- **Settings → Machines → Grid version** shows the commit this machine runs. Roles that manage machines get "Check for updates" (fetches `origin/main` and counts what's new) and **Update** (confirm first). Progress shows while it runs: getting the latest version, installing, building, restarting. The console treats the brief silence during the restart as progress, not an error, and reports "Updated to …" or why it stopped.
- **`scripts/bash/update-grid.sh`:** fetch, detached checkout of `origin/main`, `bun install`, `bun run build`, then `systemctl --user restart` the units (`GRID_UPDATE_UNITS`, default `grid-dev.service grid-pwa.service`). Progress goes to `update-status.json` and output to `logs/update.log` under `~/.local/share/grid`. A failed step is recorded and nothing restarts.
- **The runner** (`machine/update.ts`, `/machine/update`):
  - It offers updating only when it runs as a systemd service (`INVOCATION_ID`), `systemd-run` exists, and it runs from a git checkout; otherwise it says why.
  - It starts the script with `systemd-run --user`, so the update isn't one of the service's processes and survives the restart it ends with.
  - It marks the run as running at once, so a second press gets 409. A run silent for 30 minutes counts as stopped.
  - Members get 403.
- **Tests:**
  - Runner `update.test.ts` (7): availability, check, launch command and the one-at-a-time rule, stale runs, status, and route permissions.
  - Console `grid-version.test.tsx` (3): admin check and confirm-to-update, member sees no controls, and the reason shows on unsupported machines.
  - The script itself was run against a scratch repo with fake `bun` and `systemctl`. Success went `ee1b2de` → `8a3df93`, built, restarted both units and wrote `done`. A failing build wrote `failed` at "building" and did not restart.
- **Checks:** runner 508 / 508, console 716 / 716, typecheck, lint (ShellCheck included) and format pass.
- **Known limit:** Vite empties the console build folder when it starts building, so a build that fails partway leaves the console unavailable until the next good update. Building into a separate folder and swapping it in would fix that.
