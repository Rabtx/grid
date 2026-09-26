---
id: str-freebuff-interactive-cli
title: Run Freebuff CLI through an interactive Grid PTY
type: feature
from: human
to: backend
priority: high
status: doing
assignee: backend
reviewer: human
parent: none
depends_on: []
branch: agent/backend/freebuff-interactive-cli
worktree: ../grid-worktrees/agent/backend/freebuff-interactive-cli
scope:
  - apps/runner/**
  - apps/console/src/modules/terminal/**
  - bun.lock
allowed_shared:
  - apps/console/src/modules/terminal/**
  - bun.lock
created: 2026-09-27
updated: 2026-09-27
---

## What

Launch the official Freebuff CLI in the active Grid workspace through Bun PTY. Preserve raw terminal input/output and provide interpreted screen and interaction events for a mobile-friendly view.

## Scope

The human requested the cross-role runner and console integration. Reuse the existing terminal WebSocket, authentication, reconnect, and key controls. Do not use Freebuff private interfaces.

## Validation

- `bun --cwd=apps/runner test`: 113 passed; focused final PTY/server tests: 23 passed.
- `bun --cwd=apps/console run test`: 278 passed; focused final socket/token tests: 12 passed.
- `bun run lint`, `bun run typecheck`, `bun run format`, `bun run architecture:check`: passed. Existing lint warnings remain outside this scope.
- `bun --cwd=apps/console run build`: passed.
- Real installed Freebuff CLI (`0.0.201`) launched through Bun PTY in this worktree: 11,519 raw bytes, 1,619 screen characters, `screen` and `text` events. A fixture test verified workspace `cwd`, `/history` input, and exit; reconnect tests verified raw replay, parsed screen, and detected ads.
- Browser UI check could not run: this session exposed no browser to computer use. Console unit tests, token checks, typecheck, and production build passed; phone and desktop visual behavior remains for human review.
- After the independent reviewer found that an ad could scroll off during one PTY write, the VT parser now captures completed lines as they scroll. Regression tests pass for normal and alternate buffers. After merging `origin/main` (`c539575`) into this branch: runner 115 passed, console Vitest 283 passed, root lint/typecheck/format check passed, and console production build passed.
- Follow-up review found equal ad text could be collapsed. The parser now records every completed ad line, and the console appends every ad event. Regression test covers two matching ads in one write. Runner 116 passed, console Vitest 283 passed, root lint/typecheck passed after this fix.
- Another review found a split-chunk duplicate and ad-history replay on reconnect. Pending terminal lines now complete once; the WebSocket ready message replaces the ad history snapshot instead of replaying it as new events. Regression tests cover both cases. Runner 117 passed, console Vitest 284 passed, root lint/typecheck passed.
- PR CI and Security jobs did not start. GitHub annotated every job with an account payment/spending-limit issue ([CI run](https://github.com/shabirkhan-dev/grid/actions/runs/36267895920), [Security run](https://github.com/shabirkhan-dev/grid/actions/runs/36267895915)); no job logs or code failures were produced. Rerun after account billing is resolved.

## Changed

- `apps/runner/src/agents/interactive-cli.ts`, runner terminal HTTP/WebSocket support, tests, and runner README.
- `apps/console/src/modules/terminal/**` adds Freebuff launch, parsed screen view, ad display, input, and raw terminal fallback.
- `apps/runner/package.json` and `bun.lock` add `@xterm/headless`.

## Contract impact

Additive runner `POST /terminals` `provider` option, `ready.screen`/`ready.ads`, and `event` WebSocket messages; documented in `apps/runner/README.md`.

## Review

Independent review requested two ad-preservation fixes; follow-up review of the updated branch is pending on draft PR [#106](https://github.com/shabirkhan-dev/grid/pull/106). Branch is not merged.

## Commit

`4ef7042` (`feat(runner): run freebuff through interactive cli pty`), followed by the ad-scroll fix and merge of current `origin/main`.

## Resolution

Implementation committed; awaiting independent review and browser visual check before moving this card to done.
