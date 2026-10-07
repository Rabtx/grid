---
id: grid-operate-profile-polish
title: small operate and profile fixes found in the browser walkthrough
type: polish
from: pm
to: frontend
priority: low
status: open
assignee: none
reviewer: human
parent: grid-browser-verification
depends_on: []
branch: none
worktree: none
scope: [apps/console/src/modules/operate/**, apps/console/src/modules/settings/**, apps/console/src/kit/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

Found while verifying Operate and the reliability fixes in the browser, 2026-10-07 (see `2026-10-06-browser-verification`):

1. **Health polls in hidden tabs.** It keeps reading every 30 s while the tab is hidden. It should pause when hidden and read once on return.
2. **Enter doesn't submit the Operate dialogs** (Monitor service, Add log source, Record hosting charge). The fields aren't in a form.
3. **Stat strips:**
   - At about 750 px desktop width, "Latest check" truncates to "No chec…".
   - Costs has three stats in a four-cell grid, which leaves an empty bordered cell (a 2×2 grid with one blank on phones).
4. **Settings → Profile → Sessions** lists every session (over 150 on the dev demo account), each with its own "Sign out" button. Show active sessions, newest first, with the current one marked, and cap or paginate the rest.
5. **Operate's sidebar** shows Services/Incidents on Health but the project list on Logs and Costs. Make it consistent, or confirm that's intended.

## Validation

- Each fix checked at phone width and desktop width in the browser; tests where behaviour changes.

## Resolution
