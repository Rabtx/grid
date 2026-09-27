---
id: str-fix-with-an-agent
title: "Fix with an agent" on a pull request
type: feature
from: human
to: backend
priority: high
status: doing
assignee: backend
reviewer: human
parent: none
depends_on: []
branch: agent/backend/fix-with-an-agent
worktree: ../grid-worktrees/agent/backend/fix-with-an-agent
scope:
  - apps/console/src/modules/github/**
  - apps/console/src/modules/chat/**
  - apps/runner/src/github/**
  - apps/runner/src/chat/**
created: 2026-09-28
updated: 2026-09-28
---

## What

Roadmap B2's last piece. A "Fix with an agent" action on a pull request (Pull requests page) that
starts a thread in a worktree on that pull request's branch, primed with what needs fixing.

## Why / Context

Pull requests with failing checks or review comments are the most common "go fix this". The
pieces exist: pull requests (`modules/github`, runner `github/pulls.ts`), threads in worktrees
(`runner/src/chat/worktrees.ts`, `ChatHub.create({ worktree, branch })`), the composer's git
control. Worktrees are chosen, never automatic — this action is an explicit choice to make one.

## Proposal or Ask

- **Button** in the pull request's detail (merge box area): "Fix with an agent", with a short
  sheet to pick the agent/model (reuse the model picker) and what to include: failing checks,
  review comments and unresolved comments, the description; editable first message.
- **Worktree on the existing branch:** extend `createWorktree` to check out an existing branch
  (fetch it from the remote when only the remote has it) instead of creating one; a branch
  already checked out elsewhere gets a clear error (git refuses two worktrees on one branch).
  Forks: fetch the pull request ref (`pull/<n>/head`) onto a local branch.
- **Priming:** the first message lists the failing checks (name, workflow, link; the failing
  log's last lines via `gh run view --log-failed` when available, trimmed) and the review
  comments (author, file:line when inline, body), then asks the agent to fix them on this branch,
  run the checks it can, commit, and push to the pull request's branch when asked.
- After starting, go to the new thread; the pull request shows a link to the threads fixing it.

Definition of done: on a pull request with a failing check, one click (plus the sheet) opens a
thread working in a worktree on its branch with the failure in its first message.

## Scope

**In scope:** the github module (console and runner), the chat module and hub/worktrees.

**Out of scope:** automations that do this on their own (Phase C), pushing without being asked.

## Validation

- Runner tests on real temporary git repositories: worktree on an existing local branch, on a
  remote-only branch, the "already checked out" refusal; the priming text from fixture `gh` JSON.
- Console tests: the button and sheet, the thread it starts.
- `bun run lint`, `bun run typecheck`, kit guard.

## Resolution

**Changed:**

- `apps/runner/src/chat/worktrees.ts` — `createWorktree(folder, chatId, projectsDir, request)` now takes
  a `WorktreeRequest` (`branch`, `existing`, `pull`) instead of a branch string. An `existing` branch
  (or any `pull` number) is checked out as it is: a local branch directly, else `origin/<branch>`
  (fetched by name, so the worktree tracks it and pushing goes back to the pull request), else, for a
  fork's pull request, `refs/pull/<n>/head` onto a local branch from `FETCH_HEAD`. A branch that is
  already checked out here or in another worktree fails with 409
  `"<branch> is already checked out elsewhere; a branch can only be in one worktree"` (git's wording
  is matched for both `already checked out` and `already used by worktree`). No branch anywhere → 404.
- `apps/runner/src/chat/hub.ts` — `ChatHub.create` takes `existing` and `pull`; `worktreeFor` passes the
  request object through. `apps/runner/src/chat/routes.ts` — `POST /chat/sessions` maps both fields.
- `apps/runner/src/github/pulls.ts` — `PullReviewComment`, `reviewComments(answer)` (pure: unresolved
  threads only, blank bodies skipped, `line ?? originalLine`), `PullRequests.reviewComments` (GraphQL
  `reviewThreads` via `gh api graphql`), `PullRequests.failedLog` (`gh run view <id> --repo <repo>
  --log-failed`, `""` when the log cannot be read).
- `apps/runner/src/github/fix.ts` (new) — `FixInclude`, `FixPlan`, `runIdOf`, `logTail` (ANSI stripped,
  last 40 non-blank lines), `fixPrompt` (failing checks with their log tails, unresolved review
  comments, description, then "fix these on this branch…"), `fixPlan` (reads the pull request, keeps
  only `state === "failure"` checks, fetches logs concurrently, tolerates a missing log).
- `apps/runner/src/github/routes.ts` — `readInclude` (each flag defaults on) and
  `POST /github/pulls/<project>/<n>/fix` → `{ branch, message }`.
- `apps/console/src/modules/github/types/github.types.ts` + `services/pulls.service.ts` — `FixInclude`,
  `FixPlan`, `pullsService.fix`.
- `apps/console/src/modules/chat/services/chat.service.ts` — `create` carries `branch`, `existing`,
  `pull`.
- `apps/console/src/modules/github/components/fix-with-agent-sheet.tsx` (new) — the sheet: agent/model
  (`ModelPicker`), the three includes, an editable first message the runner's plan fills in (and
  refills when an include changes), then `POST /chat/sessions` with `worktree: true, existing: true,
  branch, pull`, `queueFirstMessage`, `threadsStore.upsert`, navigate to the thread.
- `apps/console/src/modules/github/components/pull-detail.tsx` — the "Fix with an agent" button in the
  merge box, the sheet, and a card listing the threads whose worktree is this branch.

**Validation:**

- `cd apps/runner && bun test src/chat src/github` → 46 pass / 6 fail. The 6 are the pre-existing
  ChatHub failures that need no change from this card: `git stash`-free proof on `main` gives the same
  `4 pass / 6 fail` for `bun test src/chat/chat.test.ts` (`ChatError: That folder is outside the
  projects directory` out of `withinProjectsDir`, reached before any worktree code runs; this sandbox's
  `tmpdir()` is a symlinked path and `insideProjectsDir` realpaths both sides). Worktree, pulls and fix
  tests pass in the same run.
- `cd apps/console && bunx vitest run` → 52 files, 306 tests, all pass (includes the kit guard).
- New runner tests: existing local branch (HEAD is the branch, no base), remote-only branch (tracks
  `origin/remote-only`), a same-repository pull request whose branch is on origin (tracks it, so a push
  goes back to the branch) versus a fork's `refs/pull/7/head` (from `FETCH_HEAD`), the "already checked
  out" refusal for the project's own branch and for another worktree's, and a hub chat on an existing
  branch. `fix.test.ts` covers `runIdOf`, `logTail`, `fixPrompt` (and what it leaves out) and `fixPlan`
  against a fake service; `pulls.test.ts` covers `reviewComments` parsing and both `gh` calls.
- New console test (`pulls-screen.test.tsx`): nothing is read until the sheet opens; opening it reads
  the plan with all three includes, turning one off asks again and rewrites the message, and starting
  posts `{ project, provider, cwd, model, worktree: true, branch: "login", existing: true, pull: 12 }`
  to `/chat/sessions` and moves to `/chat/alpha/s1`.
- `bun run lint` → runner and console exit 0 (no new warnings), `bun run typecheck` → every package
  0, `bun run architecture:check` → passed, `bunx oxfmt --check apps/console/src apps/runner/src` →
  clean.

**Contract impact:** none. The runner's `/chat/sessions` body gained two optional fields and one new
runner route was added; neither is part of the Grid API documented in
`apps/docs/content/docs/backend-api.mdx` (that document covers `apps/api`, not the runner).

**Review:** requested — human reviewer per the card.

**Commit:** see this branch's commits.
