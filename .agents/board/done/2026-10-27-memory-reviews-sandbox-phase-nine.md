---
id: grid-memory-reviews-sandbox-phase-nine
title: project memory, a review agent on pull requests, sandboxed runs
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-accountability-phase-eight
depends_on: []
branch: ccr-9c1ba5cb-8vmqkv
worktree: none
scope: [apps/runner/src/**, apps/console/**, apps/docs/content/docs/backend-api.mdx, docker/sandbox/**, docker/README.md, package.json, CHANGELOG.md]
allowed_shared: []
created: 2026-10-27
updated: 2026-10-27
---

## What

The owner's next picks: N1, a review agent that reviews every pull request and posts its review
on GitHub; N2, project memory that agents and people keep and new threads start with; N4, threads
whose agent runs in a throwaway Docker container instead of on the machine.

## Why / Context

Grid's agents do the work; these make it better reviewed (N1), less forgetful between threads
(N2) and safer to let run (N4), without tying Grid to one provider or machine.

## Proposal or Ask

Done when each works end to end against the real runner, with tests, and the API contract
documents the new routes and fields.

## Scope

**In scope:** the paths above. Reviews read GitHub through the machine's `gh`, as pull request
watches do; sandboxes need Docker on the machine and an image with the agents in it.

**Out of scope:** reviews as GitHub review comments on lines (a comment on the pull request for
now); sandboxes on remote machines other than through their own runner; publishing the image.

## Validation

- `bun test` in `apps/runner`: 655 pass, 0 fail (memory, reviews and sandbox tests included).
- A real sandboxed turn under Docker 29 on this machine: the Claude Code adapter, through
  `docker run` in a test image, answered in about 0.3 s, and its containers were gone after.
- `bunx vitest run` in `apps/console`: all pass (memory page and review dialog tests included).
- `bun run test:e2e` in `apps/console`: 10 passed, the memory test among them.
