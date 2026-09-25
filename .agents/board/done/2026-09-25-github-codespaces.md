---
id: str-github-codespaces
title: Sign in with GitHub and start, stop, create and connect Codespaces from Grid
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: .agents/plans/portable-next.md
depends_on: [str-environment-projects]
branch: agent/backend/github-codespaces
worktree: ../grid-worktrees/agent/backend/github-codespaces
scope:
  - apps/runner/src/github/**
  - apps/runner/src/environments/**
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
allowed_shared:
  - apps/console/src/modules/environments/**
created: 2026-09-25
updated: 2026-09-25
---

## What

Pairing a Codespace meant opening it, running `bun run grid:pair` and typing a code. The person
asked for GitHub sign-in so that seeing, starting, stopping and connecting Codespaces happens
in Grid, seamlessly.

## Why / Context

This builds on the environments (#72), the single-container dev container (#73), Grid as a
container service (#75) and projects on environments (#74).

## Proposal or Ask

Use GitHub's own CLI (`gh`) on the machine Grid runs on:
- its device sign-in, so there is no GitHub app to register and Grid stores no token;
- its Codespaces commands;
- its SSH channel, to fetch the pairing code from Grid inside the Codespace.

## Scope

**In scope:** runner `github/` module and routes, a `codespace` column on environments, and
the GitHub Codespaces panel on Settings → Environments.

**Out of scope:**
- deleting Codespaces (left to github.com);
- Codespaces for repositories without Grid in them.

## Validation

- Runner, `bun test`: 82 passed, including 6 for `CodespacesLink` with a scripted `gh`:
  - claiming an existing sign-in, for the first person only;
  - the device flow's code, and binding once approved;
  - asking only for the scope when it is missing;
  - listing with paired environments;
  - connect over SSH, then pairing;
  - refusing unsafe names and repositories.
- Console, `bun x vitest run`: 202 passed. `tsc` and oxlint: clean.
- Live, with this machine's real `gh`:
  - `status` shows the GitHub account with the `codespace` scope.
  - `signIn` claims it, and `list` returns the real Codespaces.
  - `connect` on a real Codespace (built from #75's branch) fetched the code over
    `gh codespace ssh` and paired over the tailnet, then opened a terminal in `/workspaces`
    through the pairing. It took about 15 seconds.

## Resolution

**Runner:**
- `github/gh.ts` runs `gh` quietly (no prompts, no browser on the host).
- `github/codespaces.ts` is `CodespacesLink`:
  - The GitHub sign-in is claimed by one Grid user, and only they can use it.
  - It covers status, device sign-in, list, start, stop, create (smallest machine), and
    connect as a background job with its progress.
- Routes: `/github`, `/github/sign-in`, `/github/codespaces…`.

**Console:** the GitHub Codespaces panel covers:
- sign-in, showing the code with a copy button and a link to github.com/login/device, and
  waiting for approval by itself;
- a list with Connect, Start and Stop, and progress shown while connecting;
- New Codespace;
- Disconnect, which leaves the machine's own `gh` sign-in alone.
