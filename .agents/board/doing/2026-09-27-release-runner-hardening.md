---
id: str-release-runner-hardening
title: Release gates and runner trust boundary
type: chore
from: human
to: backend
priority: high
status: doing
assignee: backend
reviewer: reviewer
parent: none
depends_on: []
branch: agent/backend/release-runner-hardening
worktree: ../grid-worktrees/agent/backend/release-runner-hardening
scope:
  - apps/runner/**
  - apps/docs/package.json
  - bun.lock
  - .github/workflows/ci.yml
  - .github/workflows/cd.yml
  - .agents/board/doing/2026-09-27-release-runner-hardening.md
allowed_shared:
  - apps/docs/package.json
  - bun.lock
  - .github/workflows/ci.yml
  - .github/workflows/cd.yml
created: 2026-09-27
updated: 2026-09-27
---

## Objective

Address the highest-priority release-readiness findings from the project review:

- repair the runner transcript regression and keep the runner suite green;
- upgrade the vulnerable docs Next.js dependency;
- run API contract tests in CI against a seeded, started API;
- replace placeholder CD deploy/health-check steps with fail-closed Render hooks;
- enforce the configured projects root for runner filesystem, linked-project, agent, and explicit terminal working-directory operations, while documenting the trusted-machine shell boundary.

## Acceptance

- The requested checks pass locally where the environment supports them.
- CI/CD steps fail clearly when provider configuration is missing instead of reporting a false success.
- The pull request is opened for reviewer review and is not merged.

## Progress

- Card claimed in the isolated backend worktree.
- Implementation complete; awaiting PR review.

## Changes

- Runner chat transcript assertions now accept persisted turn timestamps, while runner startup,
  folder browsing, project links, chat working directories, and terminal starting directories are
  bounded by `RUNNER_PROJECTS_DIR` with symlink-aware resolution.
- Docs uses the existing web Next.js line at 16.3.5.
- CI migrates and seeds Postgres, starts the API, waits on `/api/v1/health`, and runs the contract
  suite with an explicit `CONTRACT_API_URL`.
- CD triggers the Render API deploy hook for the exact commit and waits for a configured health URL;
  missing environment secrets fail the job instead of producing a false green deployment.

## Validation

- `bun --cwd=apps/runner run test` — 113 pass, 0 fail.
- `bun --cwd=apps/runner run lint` — pass.
- `bun --cwd=apps/runner run typecheck` — pass.
- `bun --cwd=apps/docs run types:check` — pass.
- `bun --cwd=apps/docs run build` — pass on Next.js 16.3.5.
- `bun run lint` — pass; existing warnings remain in unrelated packages.
- `bun run typecheck` — pass.
- `bun run test` — pass across workspace suites.
- `bun run architecture:check` and `bun run naming:check` — pass.
- Temporary Postgres/API contract run — 72 pass, 0 fail, 311 assertions.
- Workflow YAML parse and `git diff --check` — pass.
- `bun audit` — 80 advisories remain in the broader dependency graph; the docs Next.js critical
  finding is cleared and the remaining dependency audit is outside this slice.

## Review handoff

- Pull request opened: https://github.com/shabirkhan-dev/grid/pull/119
- GitHub Actions rerun is blocked before job startup by the repository account billing/spending
  limit; local and disposable integration validation passed.
- Do not merge until CI billing is restored and the configured staging/production environment
  secrets are reviewed.
