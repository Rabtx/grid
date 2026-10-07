---
id: grid-transcript-windowing
title: open long threads fast by not replaying and rendering the whole history
type: perf
from: pm
to: web
priority: normal
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/console/src/modules/chat/**, apps/runner/src/chat/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

Attaching to a thread sends its whole event log (`chat/hub.ts:993`), and the transcript renders every block, which is slow on phones for long threads.

## Proposal or Ask

Send and render the recent part, loading earlier history on scroll. Tests.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution
Fixed by claude, 2026-10-07.

- **Runner:** opening a thread now sends only its last 20 messages and what followed each (`HISTORY_TURNS`), plus `earlier`, the `seq` where the history before them ends. `GET /chat/sessions/:id/events?before=<seq>` returns earlier pages of the same size, scoped to the thread's workspace; environments get it through the relay. Pages always start at a message, so a turn is never split (`turn_rewrite` only reaches back to the last message). Catching up from a cursor is unchanged.
- **Console:** a "Show earlier messages" button sits at the top of a long thread, and scrolling near the top loads the next page. Your place is kept by flushing the render synchronously before restoring the scroll offset. Loaded pages don't count as new messages, so the view doesn't jump to the end. The device cache keeps `earlier` with the log; caches from before this change hold whole threads, so they count as complete.
- **Tests:** runner `chat/history-window.test.ts` checks that the pages add up exactly to the full log, that a short thread is sent whole, and that the route is scoped by workspace and rejects a bad `before`. The console socket test checks `earlier` is passed through, and defaults to null for older runners.
- **Checked in the browser:** on an isolated runner (:4199, scratch data) with this console (:3023), a seeded 50-message thread opened with Questions 31–50. Scrolling up loaded the earlier pages, Question 31 stayed exactly in place, and the button disappeared at the start of the thread.
- **Checks:** runner 501 / 501, console 703 / 703, typecheck and lint pass.
