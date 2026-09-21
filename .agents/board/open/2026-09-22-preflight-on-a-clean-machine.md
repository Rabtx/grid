---
id: str-preflight-clean-machine
title: Make `bun run preflight` runnable on a clean machine
type: chore
from: pm
to: backend
priority: high
status: open
assignee: none
reviewer: reviewer
parent: none
depends_on: []
branch: agent/backend/preflight-clean-machine
worktree: ../grid-worktrees/preflight-clean-machine
scope:
  - package.json
  - scripts/**
  - .devcontainer/**
  - .mise.toml
  - .github/workflows/**
allowed_shared: []
created: 2026-09-22
updated: 2026-09-22
---

## What

`bun run preflight` fails on a machine that has not installed three tools by hand. It should
either provide them or degrade cleanly, so a new contributor or agent can run the gate.

## Why / Context

`preflight` is `lint && typecheck && test`, and `lint` ends in `scripts:lint`:

```
"scripts:lint": "shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh && (ruff check scripts/python 2>/dev/null || true)"
```

On a clean machine `shellcheck` is missing, so the script exits 127 and takes `preflight` with
it, *after* every TypeScript check has already passed. `shfmt` is missing too, though `format`
tolerates it with `|| true`. CI installs shellcheck explicitly
(`.github/workflows/ci.yml`), so this only bites humans and agents locally — which is exactly
who needs the gate to work.

Note the asymmetry to resolve: `format` already degrades gracefully, `lint` does not.

## Proposal or Ask

Pick one and justify it on the card:

1. Provide the tools through `.mise.toml`, which already pins Bun, so `mise install` is enough.
2. Make `scripts:lint` skip a missing linter with a visible warning, the way `format` does, and
   keep CI strict so nothing actually goes unchecked there.

Option 1 is better if mise can supply `shellcheck`, `shfmt` and `ruff` on this platform; option 2
is the fallback. Do not simply delete the shell linting.

Also confirm `bun run test:scripts` still passes: it runs a bash test and a Python unittest for
what is now two hello-world scripts. If those scripts have no reason to exist in Grid, say so on
the card — but do not delete them here, it is a separate decision.

**Definition of done:** on a machine with only Bun and mise, `bun run preflight` either passes
or fails with a real finding, never with `command not found`.

## Working agreement

Work in your own git worktree, not in the shared checkout:

```bash
git worktree add ../grid-worktrees/preflight-clean-machine -b agent/backend/preflight-clean-machine
cd ../grid-worktrees/preflight-clean-machine
bun install
```

Another agent is currently updating dependencies in the main checkout. Do not edit
`package.json` or `bun.lock` unless this card says to, and do not commit anything you did not
change. Stage explicit paths — never `git add -A`.

## Validation

- Paste `bun run preflight` output from a shell where `shellcheck` is not preinstalled
- `bun run lint` and `bun run format` both behave consistently when a tool is missing
- CI still runs the shell linting strictly — show the workflow lines

## Resolution

<!-- filled by the resolver: what changed, the commit, and the command output that proves it -->
