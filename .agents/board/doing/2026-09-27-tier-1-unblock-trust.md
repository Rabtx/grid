---
id: str-tier-1-unblock-trust
title: "Tier 1: unblock trust — CI build gate, 2FA sign-in, board and repo hygiene"
type: chore
from: human
to: web
priority: high
status: doing
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
updated: 2026-09-27
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

## Resolution

(filled on close)
