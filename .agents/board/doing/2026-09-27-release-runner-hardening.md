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
