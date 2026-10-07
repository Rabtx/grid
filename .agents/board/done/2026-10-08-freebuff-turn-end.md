---
id: grid-freebuff-turn-end
title: end a freebuff turn once it is idle again, even when the footer scrolled away
type: bug
from: pm
to: runner
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-freebuff-live-structure
depends_on: []
branch: agent/runner/freebuff-turn-end
worktree: ../grid-worktrees/freebuff-end
scope: [apps/runner/src/agents/freebuff.ts, apps/runner/src/agents/freebuff.test.ts, apps/runner/src/agents/testing/**]
allowed_shared: []
created: 2026-10-08
updated: 2026-10-08
---

## What

A Freebuff turn in the live console stayed "Working" for 13 minutes after Freebuff had finished. The reply was saved in Freebuff's chat file and its PR was opened. The build in use doesn't mark replies complete in that file, so the adapter falls back to the screen. It waits for the footer under the reply (`⎘ • 7s`), and in a long reply that scrolled, the tracker lost that footer, so the turn never ended.

## Proposal or Ask

Also end the turn when Freebuff, having been seen working on it, is back to an empty input box with nothing running, and stays there for the same 3 s.

## Validation

- A fake-CLI test with neither the file's `isComplete` nor the footer: the turn ends with the exact reply.

## Resolution
Fixed by claude, 2026-10-08.

- **Fix:** the turn loop remembers whether the screen ever showed Freebuff working. A reply ends when the screen shows it finished, as before, or when Freebuff has worked and is idle again (input box empty, nothing running, no picker open) for 3 s. The text still comes from the chat file.
- **Test:** new `FAKE_NO_FOOTER` in the fake CLI. The new test times out at 20 s without the fix and passes with it.
- **Checks:** runner freebuff 34 / 34; typecheck, lint and format pass.
