---
id: grid-reliability-phase-seven
title: reliability — chaos tests, replays of every agent, a nightly real-agent check, state across restarts, console e2e
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-outside-phase-six
depends_on: []
branch: ccr-9c1ba5cb-8vmqkv
worktree: none
scope: [apps/runner/**, apps/console/**, apps/docs/content/docs/**, .github/workflows/**, CHANGELOG.md, package.json, bun.lock, .gitignore]
allowed_shared: []
created: 2026-10-27
updated: 2026-10-27
---

## What

The owner's picks R1, R2, R3, R4 and R8: chaos tests that kill the real runner mid-work (R1),
recorded replays for any agent from one script (R2), a nightly check with real agents that
reports drift (R3), state that survives restarts (R4), and end-to-end tests of the console
against the real stack (R8).

## Why / Context

Phases 1–6 built a lot that must hold up when the runner crashes, when an agent's CLI changes,
and when everything runs together. Until now only unit tests and hand-run checks covered that.

## Proposal or Ask

Done when each kind of test runs (the chaos and replay tests with `bun test`, the console e2e in
CI) and what they find is fixed.

## Scope

**In scope:** the paths above. Codex and opencode are not installed or signed in on the machine
this was built on, so only Claude Code is recorded; the script records the others where they are.

## Evidence

- Found and fixed by the new tests: stopping a real Claude Code turn recorded it as failed
  (`error_during_execution`; the old fake answered an interrupt with success); an automation run
  whose thread was carried on after a crash was marked failed while the thread finished; the
  smoke check (`bun run smoke`) no longer ran since the projects-directory guard.
- `bun test` in apps/runner: 624 pass, among them `chaos.test.ts` (six scenarios against the real
  runner killed with SIGKILL, integrity checked after each crash; three runs in a row green),
  `recorded.test.ts` (five recorded Claude Code scenarios replayed, drift detection),
  `rate-log.test.ts`, idle compaction after a restart, automation runs following carried-on
  threads.
- `vitest run` in apps/console: 774 pass, with unreadable API answers.
- `bun run test:e2e:console`: 7 pass, three runs in a row, against the real API, runner and
  console: setup, a thread, a thread link, snooze, a guest on a phone-sized page, an agent key
  over MCP, a signed webhook run once.
- Real Claude Code: `bun run smoke claude` passes (created ✓, resumed ✓); `bun run record:agents
  claude --model haiku` recorded all five scenarios.
- Not run: the nightly workflow itself (it needs the repository's agent keys as secrets).
