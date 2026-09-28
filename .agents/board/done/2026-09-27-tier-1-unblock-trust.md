---
id: str-tier-1-unblock-trust
title: "Tier 1: unblock trust — CI build gate, 2FA sign-in, board and repo hygiene"
type: chore
from: human
to: web
priority: high
status: done
assignee: web
reviewer: human
parent: none
depends_on: []
branch: agent/web/tier-1-unblock-trust
worktree: ../grid-worktrees/agent/web/tier-1-unblock-trust
scope:
  - .github/workflows/**
  - package.json
  - render.yaml
  - env.docker.example
  - apps/docs/package.json
  - apps/docs/content/docs/deploy.mdx
  - apps/docs/content/docs/qol.mdx
  - apps/console/src/modules/auth/**
  - apps/console/src/kit/**
  - apps/runner/src/chat/chat.test.ts
  - .agents/board/**
allowed_shared:
  - .github/workflows/**
created: 2026-09-27
updated: 2026-09-28
---

## What

Close the five gaps that make a green pipeline and a green board mean less than they appear to.
CI never builds, the API's contract suite is outside CI, the console refuses accounts that enabled
2FA, two board cards claim "doing" for work already merged, and 15 merged worktrees plus 30 merged
branches are still live.

## Why / Context

A repo-wide audit found these while reading the whole tree. Each is small on its own; together they
mean the signals the project relies on — CI, the board, worktree state — cannot currently be
trusted to mean "this works" or "this is done".

- No `bun run build` in any workflow, while `AGENTS.md` claims CI covers build. A Vite or Next
  build break ships green.
- `apps/api`'s `test:contract` (72 tests) is invoked by no workflow, script or hook. It is the suite
  that proved the NestJS to Hono cutover, and the backend charter requires it.
- `apps/docs` exposes `types:check` rather than `typecheck`, so root `bun run --filter '*' typecheck`
  silently skips it.
- CI installs Rust and clippy, then never runs `cargo test` or `cargo clippy`.
- `apps/console/src/modules/auth/context/auth-context.tsx:163` throws
  `"This account needs a second factor, which the console cannot do yet."` while the API ships full
  TOTP plus recovery codes at `POST /api/v1/auth/methods/two-factor/verify`. Enabling 2FA locks a
  user out of the product surface permanently.
- `.agents/board/doing/2026-09-27-console-design-system.md` lists 13 branches, all merged, with no
  Resolution. `.agents/board/doing/2026-09-26-workspaces-console.md` has 3 of 4 PRs merged and no
  Resolution. `.agents/board/open/2026-09-26-pglite-optional.md` says `status: backlog`, which
  `board/README.md` requires to match its folder and which `template.md` does not allow. A third
  in-progress card, `2026-09-27-freebuff-interactive-cli.md`, exists only on an unmerged branch, so
  the board on `main` under-reports active work by one card.
- 17 live worktrees; 15 sit on branches already merged into `main`. `git branch --merged main`
  returns 30 non-`main` branches.

## Proposal or Ask

Five separable changes, one commit each, on one branch.

1. **CI actually gates.** Add a `build` job running `bun run build`. Add an `api-contract` job
   that migrates a fresh Postgres and runs `bun --cwd=apps/api run test:contract`. Add `typecheck`
   to `apps/docs`. Add `cargo test` and `cargo clippy` to the existing Rust-enabled test job. Wire
   the new jobs into the `cd.yml` quality gate so a release cannot bypass them.
2. **2FA sign-in.** Add a two-factor step to the console sign-in flow that calls the existing
   endpoint, handles the challenge, accepts a TOTP code or a recovery code, and surfaces the API's
   error on a bad code. Uses existing kit primitives only.
3. **Board hygiene.** Resolve the two stale `doing/` cards with real Resolutions. Move the
   PGlite card's status to a value the template allows, or add a card for the missing in-flight
   Freebuff work.
4. **Worktree and branch prune.** Remove worktrees and branches already merged into `main`. Unmerged
   branches and the worktree for the open Freebuff PR stay.
5. **Residue.** Delete `apps/nest-api/` (0 tracked files, untracked build output only) and
   `scripts/python/` (only an untracked `.pyc`). Drop `AI_SERVICE_TOKEN` from `render.yaml`, which
   provisions a secret for a service deleted in `d22fef8`.

**Definition of done:** a build break, a broken API contract, a docs type error, a failing Rust
test, or a regression in the 2FA step each fail CI; the board's `status` fields agree with their
folders and every `doing/` card describes work that is actually in flight; no worktree or branch
survives on merged commits; no tracked file references a deleted service.

## Scope

**In scope:**

- `.github/workflows/ci.yml`, `.github/workflows/cd.yml`
- root `package.json` (only if a new script is genuinely needed)
- `render.yaml`
- `apps/api/package.json`, `apps/docs/package.json`
- `apps/console/src/modules/auth/**`, and `apps/console/src/kit/**` only if a 2FA field is missing
- `.agents/board/**`

**Out of scope:**

- The API's 2FA implementation. It is correct and stays as it is; the console learns to call it.
- `AGENTS.md`'s CI table wording, except where a new job makes it wrong. Docs drift is its own card.
- The stale `NEXT_PUBLIC_NEST_API_URL` name in `apps/web` and the docs app. Renaming a public env
  var is a breaking change and needs its own card.
- Agent runs in Postgres, runner hardening, billing enforcement, and the rest of Tier 2–4.
- Any unmerged branch or the worktree holding the open Freebuff PR.

**Shared paths note.** `.github/workflows/**`, root `package.json`, `render.yaml` and
`apps/docs/package.json` are not assigned to any role in `.agents/ownership.yaml`, whose policy is
`deny-unowned-writes`. They are listed in `scope` and `allowed_shared` here so the card is the
authorisation. The human requested this cross-scope work in one pass and is the `reviewer`.

## Validation

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run architecture:check`
- `bun run naming:check`
- `bun run build`
- CI: confirm the new `build`, `api-contract`, docs-typecheck and Rust jobs run and pass on this PR
- 2FA: sign in with a TOTP-enabled account against a throwaway database clone; confirm the
  challenge appears, a wrong code is rejected inline, a recovery code works, and a single-factor
  account never sees the step. Checked at 1280px and 375px, light and dark.
- Board: `status` in every card's frontmatter matches its folder; no `doing/` card has all of its
  branches merged without a Resolution.
- Repo: `git worktree list` and `git branch --merged main` show no merged leftovers;
  `grep -r AI_SERVICE_TOKEN` returns nothing; `apps/nest-api` and `scripts/python` are gone.

## Validation run

All from the worktree on Bun 1.4.2, against a throwaway database
(`grid_t1_contract` on the local Postgres) that was dropped and recreated from scratch, so the dev
data was never touched.

| Check | Result |
|---|---|
| `bun run lint` | pass (oxlint + shellcheck; 4 pre-existing `apps/web` warnings) |
| `bun run format` | no changes — already clean |
| `bun run typecheck` | pass, all 9 workspaces, `apps/docs` now included |
| `bun run architecture:check` | `Architecture checks passed.` + `[naming] OK (634 path(s) checked)` |
| `bun run naming:check` | `[naming] OK (634 path(s) checked)` |
| `bun run build` | pass — console, web, docs all `Exited with code 0` |
| `bun run test:coverage` | web 31, api 45, db 4, logger 3, console 292, runner 110 — 0 failures |
| `bun run rust:lint` | clippy `-D warnings` clean, `cargo fmt --check` clean |
| `bun run rust:test` | 1 passed, 0 failed |
| `bun run ci:test:contract` | **72 pass, 0 fail, 311 assertions** against a freshly migrated + seeded database |
| `git worktree list` | 4 worktrees: `main`, this card, and the two in-flight backend branches |
| `git branch --merged main` | nothing left to prune; the 3 remaining branches are all unmerged |
| `git grep AI_SERVICE_TOKEN` | no matches |

### CI could not run

Draft PR #120: every job is annotated *"The job was not started because recent account payments
have failed or your spending limit needs to be increased."* An account-level GitHub billing block,
not a code failure — no job logs exist and no test ran. The same blocker is recorded on
`2026-09-27-freebuff-interactive-cli.md` (PR #106), so it is not specific to this branch.

Nothing above is a claim that CI is green. Every command the CI jobs run was run locally instead,
and each new job's recipe was executed by hand before being written into the workflow. Someone with
billing access has to re-run CI before this merges; the gates themselves are unproven on GitHub's
runners even though the commands are proven here.

### CI jobs added, and how each was proven before landing

- **`build`** — `bun run ci:build` run locally; all three buildable apps exit 0.
- **`api-contract`** — the whole recipe run by hand against a clean database: migrate, seed, start
  the API, poll `/api/v1/health` until healthy, `bun run ci:test:contract`. 72/72. The recipe
  mirrors the job step for step.
- **docs typecheck** — `apps/docs` renamed `types:check` to `typecheck`, so root
  `bun run --filter '*' typecheck` now includes it. Confirmed in the typecheck run above.
- **`rust:lint` / `rust:test`** — new root scripts, run locally, added to the `test` job and to the
  CD quality gate.
- **`preflight`** now includes `build`, so `cd.yml`'s release gate cannot bypass it.

### 2FA, in a real browser

Against a real API with TOTP enabled on the seeded demo account (enabled through
`/auth/security/totp/setup` + `confirm`, so the API's own TOTP produced the codes). Driven with
Playwright at 1280x900 and 375x812, light and dark:

- wrong password → inline alert `Invalid email or password`, no crash
- correct password → the code step replaces the form, headed `Two-factor code`, naming
  `demo@grid.dev` and mentioning recovery codes
- wrong code → inline alert `The code is invalid or expired`, the step stays open with the code still
  in the field so another can be typed
- a real TOTP code → signed in, landed on `/`
- the code field is autofocused on arrival (`document.activeElement` is the
  `one-time-code` input), so a code can be typed straight away
- no page errors beyond the deliberate 401s from the two wrong-attempt steps

Also confirmed directly against the API with curl: `POST /auth/login` returns
`{requiresTwoFactor, challengeToken, expiresAt, methods}`, a wrong code is `401 AUTH_OTP_INVALID`,
and both a fresh TOTP code and a whitespace-padded recovery code (` a9d4cc47-355a4528 `) return a
session — which is why the console trims before sending and one field takes both.

### Found along the way: `main`'s runner suite was already failing

`apps/runner/src/chat/chat.test.ts` pinned the exact logged event list, but the turn-timing work
landed in `a9bb1c3` and the runner now stamps `at` on `turn_start` and `turn_end`
(`apps/runner/src/chat/hub.ts:314,330`). The assertion had not been updated, so
`bun run test:coverage` failed on `main` — 109 pass, 1 fail — which means CI has been red, and the
new build and contract gates would have been red too. Fixed by matching `at` with
`expect.any(String)` (the log's *shape* is what that test is about, not a clock value) and adding
an explicit assertion that both stamps are real times and correctly ordered.

Worth a follow-up card: the restart-repair path (`closeStaleTurn`,
`apps/runner/src/chat/hub.ts:502-506`) still synthesises a `turn_end` with no `at`, so a turn cut
short by a runner restart shows no duration in the console. The console copes — the field is
optional by type — but the two paths disagree.

## Follow-ups this card surfaced, not done here

1. `DESIGN.md` documents the token layer the console abandoned — `text-ink`, `bg-canvas`,
   `bg-selection`, `rounded-sm/md/lg` all have zero uses, against a live vocabulary of `text-fg`,
   `bg-surface`, `rounded-kit*`. It also points at a renamed `lib/preferences.ts` and a deleted
   `apps/web/src/components/ui`, and omits `kit.css` from the token export list.
2. `packages/tokens/**`, `packages/logger/**`, `packages/typescript-config/**`, `scripts/**` and
   every root and CI file are owned by nobody under `deny-unowned-writes`, and no CI job reads
   `ownership.yaml`. This card had to widen its own scope to touch them.
3. `apps/runner/src/chat/hub.ts:502-506`: the restart-repair path stamps no `at` on the
   `turn_end` it synthesises, so a turn cut short by a restart shows no duration.
4. Enabling TOTP on the seeded `demo@grid.dev` makes `test:contract` unable to sign in. Fine in CI,
   which builds a fresh database each run, but surprising on a persistent dev database. The seed
   could refuse to touch an account that already has 2FA, or the contract harness could use its own
   account.
5. The docs app still describes three apps and calls `apps/web` the control plane, and
   `quick-start.mdx` never mentions `bun run grid` — the path `README.md` and `PROJECT.md` both
   lead with.

## Resolution


Merged to `main` as #120; the board was brought up to date on 2026-09-28.
(filled on close)
