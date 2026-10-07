---
id: grid-drop-turn-rewrite
title: drop the turn rewrite replay left from freebuff
type: chore
from: pm
to: console
priority: low
status: done
assignee: claude
reviewer: human
parent: grid-remove-freebuff
depends_on: []
branch: agent/console/drop-turn-rewrite
worktree: ../grid-worktrees/drop-rewrite
scope: [apps/console/src/modules/chat/lib/transcript*.ts, apps/console/src/modules/chat/types/chat.types.ts]
allowed_shared: []
created: 2026-10-08
updated: 2026-10-08
---

## What

After Freebuff was removed, the console still folded `turn_rewrite` from older logs, so old Freebuff threads read exactly as they were. The person wants that removed as well.

## Resolution
Fixed by claude, 2026-10-08.

- **Removed:** the `turn_rewrite` case in `applyEvent`, the event and `TurnEvent` types, and their two transcript tests. An old log's `turn_rewrite` now falls to the default case and is skipped, so old Freebuff threads show the text as it streamed.
- **Browser:** an old Freebuff thread on a test copy of this branch opens and renders its history.
- **Checks:** console 719 / 719; typecheck, lint and format pass.
