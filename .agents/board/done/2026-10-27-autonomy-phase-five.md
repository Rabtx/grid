---
id: grid-autonomy-phase-five
title: threads that keep going — usage-limit resume, pull request watches, goals, idle compaction
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-orchestration-phase-four
depends_on: []
branch: ccr-9c1ba5cb-8vmqkv
worktree: none
scope: [apps/runner/src/**, apps/console/src/**, apps/docs/content/docs/backend-api.mdx, CHANGELOG.md]
allowed_shared: []
created: 2026-10-27
updated: 2026-10-27
---

## What

The owner's picks I–L from the comparison with T3 Code: a thread a usage limit stopped carries on
when the limit resets (I), agents watch pull requests and are woken by what changes (J), `/goal`
keeps an agent working until it says the goal is met (K), and projects can compact idle Claude
Code threads before their prompt cache expires (L).

## Why / Context

Each is a place where work stopped and waited for the person for no good reason: a limit that
resets at 3pm, CI that fails while nobody looks, a task that needs ten turns of "keep going", a
large conversation read again at full price after lunch.

## Proposal or Ask

Done when each works with real agents, with runner and console tests, and the API contract
documents the new events, routes, tools and setting.

## Scope

**In scope:** the paths above. Waits, watches and goals are kept in SQLite (`AutonomyStore`);
compaction timers are in memory by design. Pull requests are read through GitHub's REST API with
`gh api` (GraphQL is not available everywhere).

## Evidence

- `bun test` in apps/runner: the new `autonomy.test.ts` covers usage-limit kinds and reset times
  (unix seconds, "try again at", "resets 3pm (Zone)", the account's reported reset), carrying on
  once and not looping on the same reset, cancelling on the person's message; pull request news
  (failed checks, all passed, conflict, others' remarks), waking, ending on merge, after ten
  comment-only wakes, after eight failed reads, and on Stop; goals met, blocked, out of turns,
  resumed, paused by Stop, and set mid-turn; idle compaction's delay and scheduling.
- `vitest run` in apps/console: transcript goal and limit-wait state and lines, Grid's reasons,
  and `/goal` set, show, pause, resume and clear.
- Live with real Claude Code on a local stack: an agent watched the open pull request #242 of this
  repository (read over REST: every check passed) and unwatched it; `/goal` typed in the composer
  ran a goal turn in which the agent created and checked a file and said GOAL MET, and the goal
  showed as met over the composer; `/compact` sent as Grid sends it completed as a turn.
- Not live: a real usage limit (none was reachable), and an actual wake from a pull request change.
