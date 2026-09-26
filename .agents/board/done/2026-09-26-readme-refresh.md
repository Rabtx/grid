---
id: str-readme-refresh
title: Refresh Grid product and technical introductions
type: chore
from: human
to: pm
priority: normal
status: done
assignee: codex
reviewer: human
parent: none
depends_on: []
branch: agent/pm/readme-refresh
worktree: ../grid-worktrees/agent/pm/readme-refresh
scope:
  - README.md
  - PROJECT.md
  - apps/runner/README.md
  - apps/nest-api/README.md
  - .agents/board/doing/2026-09-26-readme-refresh.md
allowed_shared:
  - README.md
  - PROJECT.md
  - apps/runner/README.md
  - apps/nest-api/README.md
created: 2026-09-26
updated: 2026-09-26
---

## What

Rewrite the entry README and project reference around Grid's actual product loop, current
features, setup, and planned work. Correct stale introductions in the runner and API READMEs.
The human explicitly requested a README refresh; paths outside PM ownership are listed as
shared work on this card.

## Done when

- A new reader understands the problem, intended user, and current product in the first screen.
- Shipped features, open board cards, and longer-term vision are clearly distinguished.
- Commands, requirements, app layout, and links match the current repository.
- No code or other teams' documentation changes.

## Validation

- Check claims against current source, plans, board, and command scripts.
- Check links and commands; run `git diff --check`, `bun run lint`, and `bun run format`.

## Resolution

Changed: `README.md`, `PROJECT.md`, `apps/runner/README.md`, and
`apps/nest-api/README.md`. The entry docs now explain Grid's problem, working product loop,
one-command setup, current architecture and state boundaries, and planned work without
claiming that future ship/operate surfaces already exist. The app READMEs no longer describe
the runner as terminal-only or the API as lacking projects and tasks.

Validation: checked all relative links in the four changed docs (none broken), compared claims
with current source and board cards, and ran `git diff --check`, `bun run format`, and
`bun run lint` (pass, existing warnings outside the changed docs). Commit hooks also passed
architecture and typecheck. No API, schema, or runtime contract changed.

Implementation commit: `29518d2` (`docs: explain grid product and current architecture`).
Review: human reviewer pending through [PR #85](https://github.com/shabirkhan-dev/grid/pull/85).
Reviewed and merged in #85.

Follow-up outside this card: `AGENTS.md` still describes the product as an unbuilt engineering
spine, and the portable guide still instructs people to install agents manually in a Codespace.
Their owners should refresh those sources separately.
