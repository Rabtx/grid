---
id: grid-operate-profile-polish
title: small operate and profile fixes found in the browser walkthrough
type: polish
from: pm
to: frontend
priority: low
status: done
assignee: claude
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
Fixed by claude, 2026-10-07. Each item was checked in the browser (isolated runner :4199, console :3023, seeded demo account) on desktop (1024 px) and phone (375 px).

1. **Hidden-tab polling:** Health and the shared Operate reader (Logs' 15 s tail) skip their interval while the tab is hidden and read once when it's visible again. Browser check with the tab faked hidden: 0 reads in 32 s, then 1 read on return.
2. **Enter submits:** the kit `Dialog` has an `onSubmit` prop. Enter in a text field submits; a textarea, Shift+Enter and IME composition are left alone. Monitor service, Add log source and Record hosting charge use it, behind the same checks as their buttons. A source was added by pressing Enter in the browser. New `kit/dialog.test.tsx`.
3. **Stat strips:** `HealthStrip` is one flex row from lg, so three stats fill it (desktop Costs cells measured 209/209/208 px). On phones a lone last stat spans the row; Health keeps a clean 2×2. Desktop overrides match the phone rules' specificity, so nothing overlaps at exactly 1024 px. "No checks yet" became "None yet", so it fits.
4. **Sessions:** this device first, then most recently used, showing 5 with "Show all N sessions". This applies on the desktop page and the phone sheet (both checked against the dev account's 142 sessions). New `lib/sessions.ts` and its test.
5. **Operate sidebar:** Logs and Costs now fill the panel as Health does.
   - Logs lists its sources; choosing one shows its tail.
   - Costs lists agents and recorded hosting charges.
   - `ShipPanelRow` can now be a link, a button or a plain row.

**Checks:** console 715 / 715, typecheck and lint pass.
