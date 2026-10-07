---
id: grid-freebuff-failures-and-claude-models
title: say why freebuff stops, read its picker mid-session, and list every claude model
type: bug
from: pm
to: runner
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-freebuff-turn-end
depends_on: []
branch: agent/runner/freebuff-reliability
worktree: ../grid-worktrees/freebuff-rel
scope: [apps/runner/src/agents/freebuff*.ts, apps/runner/src/agents/claude.ts, apps/runner/src/agents/catalogs.test.ts, apps/runner/src/agents/testing/**]
allowed_shared: []
created: 2026-10-08
updated: 2026-10-08
---

## What

- **Freebuff failures were unexplained:** messages failed with "did not take the message" or "did not respond in time", with no clue why. Sometimes a turn ended "done" with nothing in it.
- **Claude Code showed only 4–5 models:** the person wants every model listed.

## Proposal or Ask

Find each cause on the real CLIs and fix it, then test in a real browser before the PR.

## Resolution
Fixed by claude, 2026-10-08.

Causes found on the live CLIs:

1. **Running session, picker unreadable:** once a session runs, Freebuff's picker shows a model's status ("Stalled") under its label instead of its price. The parser keyed on "Freebucks/hr", so mid-session the picker read as empty and every model step timed out: "did not respond in time" on `continue`, and model refreshes failing. The picker is now read from the boxes under its hint line, by label: first row, plus the next row when the label ends in " ·". The fake CLI now drops prices once a session runs. The mid-chat switch test fails without the fix.
2. **Lapsed sign-in:** Freebuff's sign-in lapsed ("We found an API key but it appears to be invalid … Press ENTER to login"), and Grid waited out its timeouts. It now says at once: "Freebuff is signed out on this machine. Open a terminal, run `freebuff`, press Enter and sign in, then send this again."
3. **Account suspended:** after the person signed in again, Freebuff answered every message with a box: "This account is suspended. If this is a mistake, contact support@codebuff.com. Enter: retry  Esc: back to draft". `refusal()` reads that box, and the turn fails with Freebuff's own words within seconds.
4. **Empty replies marked done:** a message Freebuff takes and then ends with no reply now fails with its warning instead of ending "done" and empty.
5. **Emoji:** Freebuff's input box drops emoji, so a message with one was never matched to its echo or its saved reply. Comparisons now ignore emoji (`squash`, shared by the screen and the chat file).
6. **Logging:** every Freebuff failure writes its last screen lines to the runner log, which is how causes 1 and 3 were found.

7. **Claude models:** signed in to Anthropic, Claude Code's picker is deliberately short. It lists every version only in its cloud-provider mode. Grid now also asks a Claude Code in that mode (`CLAUDE_CODE_USE_VERTEX=1`, empty scratch `HOME`: no settings, no sign-in, nothing sent). The picker's own rows come first under "Claude Code", then each version not already offered under "More versions". Provider dates (`@20250805`) are dropped, and a 1M row says "(1M context)". With 2.1.292 that's 14 models, plus Default. If the full list can't be had, the picker rows alone are the list.

Evidence (browser, a test copy of this branch on :3023/:4199 with scratch data):
- **Claude models:** Settings → Claude Code → Refresh shows "15 known". The picker reads "Search 14 models", with both groups.
- **Freebuff signed out:** a message got the sign-in text within about 13 s.
- **Freebuff suspended:** a message got "Freebuff: This account is suspended …" within 4 s.
- **Not tested end to end:** a successful Freebuff turn with tools. The account is suspended, and Claude Code runs are refused by the person's organization ("Your organization has disabled Claude subscription access for Claude Code"); both are account settings Grid can't change.

Checks: runner 522 / 522; typecheck, lint and format pass.
