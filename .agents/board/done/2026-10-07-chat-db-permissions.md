---
id: grid-chat-db-permissions
title: keep the runner's chat database private to its owner
type: bug
from: pm
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/runner/src/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

`chat.db` is created world-readable (`-rw-r--r--`, 54 MB of transcripts and tool output). The vault key and backups are 0600. `chat/store.ts:164` opens it with no file mode.

## Proposal or Ask

Create (and tighten existing) runner databases at 0600, including the WAL and SHM files. Test the mode.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution
Fixed by claude, 2026-10-07. A new helper, `openPrivateDatabase` (`apps/runner/src/private-database.ts`),
creates each runner database at 0600 and tightens existing database, WAL, SHM and journal files on
open. All 18 runner stores use it. A process-wide umask was rejected because terminals and agents
inherit it. Tests in `private-database.test.ts`: new databases and their WAL and SHM files are
0600, an existing 0644 file is tightened, and in-memory databases are untouched. Runner 485 / 485,
lint and architecture checks pass. The live `chat.db` is tightened the next time the runner starts.
