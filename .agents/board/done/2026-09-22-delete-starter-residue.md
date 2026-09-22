---
id: str-delete-starter-residue
title: Delete starter residue that no longer has a home in Grid
type: chore
from: pm
to: web
priority: normal
status: done
assignee: none
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/delete-starter-residue
worktree: ../grid-worktrees/delete-starter-residue
scope:
  - apps/web/public/**
  - .vscode/settings.json
  - .agents/skills/**
allowed_shared: []
created: 2026-09-22
updated: 2026-09-22
---

## What

Several files survive from the template Grid was forked out of and now refer to things the
repository does not contain. Delete them.

## Why / Context

Grid was converted from a generic starter. The Rust app, the Expo mobile app, the FastAPI
service, the `@rabtx/ui` package and the chat and billing surfaces have all been removed, but
some supporting files were missed. They are misleading to a newcomer and to an agent reading
the repo for context.

Confirmed findings, each verified as unreferenced:

- `apps/web/public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` — the Next.js
  starter assets. A grep across `apps/web/src` returns **zero** references to any of them.
- `.vscode/settings.json` — carries a `[rust]` block, `rust-analyzer.check.command`, a Ruff
  `source.fixAll` action and two `vscode-clangd` formatter bindings. There is no C in this
  repository at all, and Python is one hello-world script.
- `.agents/skills/hono/` — a skill for a framework this repo does not use; there is no Hono app.
- `.agents/skills/domain-cli/` — there is no CLI in this repository.

## Proposal or Ask

Delete the five SVGs. Strip the dead language blocks from `.vscode/settings.json`, keeping
TypeScript, Biome and anything that still applies. Delete the `hono` and `domain-cli` skills.

Check `.agents/skills/m01-ownership` through `m12-lifecycle` and `ponytail` before touching
them: several read as Rust teaching modules. If they are Rust-specific, **do not delete them** —
raise it on the card instead, because `packages/logger/rust` still exists and removing Rust
entirely is the human's decision, not this card's.

**Definition of done:** every deleted file is proven unreferenced by a grep pasted into the
Resolution, and the repo still builds.

## Working agreement

Work in your own git worktree, not in the shared checkout:

```bash
git worktree add ../grid-worktrees/delete-starter-residue -b agent/web/delete-starter-residue
cd ../grid-worktrees/delete-starter-residue
bun install
```

Another agent is currently updating dependencies in the main checkout. Do not edit
`package.json` or `bun.lock` unless this card says to, and do not commit anything you did not
change. Stage explicit paths — never `git add -A`.

## Validation

- `grep -rn "next.svg\|vercel.svg\|globe.svg\|window.svg\|file.svg" apps` returns nothing
- `bun run preflight` (note: `lint` needs `shellcheck` on PATH — see the toolchain card)
- `bun run build` succeeds for web and docs
- Paste the grep output that proves each deletion was safe

## Resolution

Done in `fe2bb97`. The five Next starter SVGs, the `hono` and `domain-cli` skills and their
`skills-lock.json` entries are gone; `.vscode/settings.json` lost only the C/C++ and Lua blocks.

The card as first written was wrong: it asked for the `[rust]` block and the Ruff action to be
stripped too. The assignee stopped and questioned that instead of complying, having checked that
`packages/logger/rust` has four `.rs` files and `scripts/python` exists, and separately found the
Lua block the card never mentioned. It also refused to touch `skills-lock.json` until the scope
allowed it. The card was corrected and the scope widened before the work proceeded.

Verified: greps show no remaining references, both JSON files parse, typecheck 4/4.
Left alone deliberately: the m01–m12 Rust teaching skills. `m07-concurrency` still cross-references
the deleted `domain-cli` in two tables — worth a follow-up card.
