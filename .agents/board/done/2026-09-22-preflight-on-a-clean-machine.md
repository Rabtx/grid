---
id: str-preflight-clean-machine
title: Make `bun run preflight` runnable on a clean machine
type: chore
from: pm
to: backend
priority: high
status: done
assignee: backend
reviewer: reviewer
parent: none
depends_on: []
branch: agent/backend/preflight-clean
worktree: ../grid-worktrees/preflight-clean
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

**Option chosen: 1 — provide the tools through `.mise.toml`.** Mise can supply `shellcheck`,
`shfmt` and `ruff` on linux-x64 (verified: `mise ls-remote` lists them and a full
uninstall → `mise install` cycle driven purely by `.mise.toml` reinstalls all three, with
`mise ls` showing them sourced from this worktree's `.mise.toml`). Provisioning beats weakening
the check: `scripts:lint` keeps running shellcheck strictly, no skip logic added.

Changed:

- `.mise.toml` — added `ruff = "0.16.8"`, `shellcheck = "0.11.0"`, `shfmt = "3.14.1"` alongside
  the existing `bun = "1.4.2"` pin. `mise install` is now enough on a clean machine.
- This card — claimed (`open/ → doing/`, `assignee: backend`, `status: doing`), branch/worktree
  corrected to the actual worktree (`agent/backend/preflight-clean`,
  `../grid-worktrees/preflight-clean`).
- Not touched: `package.json`, `bun.lock`, `scripts/**`, `.github/workflows/**`,
  `.devcontainer/**` (the devcontainer already installs all three tools itself).

Validation:

- `bun run preflight`: **exit 0** — lint (incl. shellcheck via mise) → typecheck → test all pass
  (full output recorded in the handoff report).
- `bun run lint`: exit 0. `bun run format`: exit 0. `bun run test:scripts`: exit 0 (bash test +
  python unittest OK).
- Clean-machine proof: at session start this machine had no `shellcheck`, `shfmt` or `ruff`
  (`command -v` → not found; never apt-installed). After the `.mise.toml` change + `mise install`
  they resolve from the project config; preflight then passes. No `command not found` anywhere.
- Missing-tool behavior, measured honestly (uninstall both tools, then restore): with a tool
  missing, `scripts:lint` exits 127 while `scripts:format` exits 0 via `|| true`. That asymmetry
  now only bites machines that skip mise entirely — outside the DoD ("only Bun and mise"). On the
  supported path both `bun run lint` and `bun run format` run their shell tools and pass
  consistently. Option 2 (skip-with-warning) was the card's *conditional* fallback for when mise
  cannot supply the tools; mise can, so the check was not weakened. `mise install` restores
  everything in ~6s.
- CI strictness unchanged — `.github/workflows/ci.yml`:

  ```yaml
  - name: Install lint runtime
    run: sudo apt-get update && sudo apt-get install -y shellcheck

  - name: Lint
    run: bun run ci:lint
  ```

- Hello-world scripts: `scripts/bash/main.sh` and `scripts/python/main.py` are template greeting
  scripts with no product role in Grid today. They have no reason to exist long-term, but
  deleting them is a separate decision — left in place here per the card.

Contract impact:

- none — tooling pin only; no API/schema/design change.

Review:

- reviewer: pending — card left in `doing/`.

Commit:

- none — instructed not to commit; the working tree holds the exact diff (`.mise.toml` + this
  card move/edit) for review.

Done. Option 1 was taken: `.mise.toml` now declares `shellcheck`, `shfmt` and `ruff` alongside
`bun`, so `mise install` supplies them and `scripts:lint` keeps running shellcheck strictly rather
than being weakened.

Verified independently of the assignee's report: all three tools resolve through mise in a fresh
worktree, and `bun run preflight` exits 0 with shellcheck checking every file in `scripts/bash` and
`scripts/git-hooks`. CI is untouched and still installs shellcheck itself.

Residual gap: this only helps once `mise install` has been run, so the README prerequisite now says
so explicitly.
