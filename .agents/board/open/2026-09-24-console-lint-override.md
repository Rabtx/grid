---
id: str-console-lint-override
title: Stop React and Next.js lint rules firing on the Solid console
type: chore
from: human
to: pm
priority: normal
status: open
assignee: none
reviewer: claude
parent: none
depends_on: []
branch: agent/pm/console-lint-override
worktree: ../grid-worktrees/agent/pm/console-lint-override
scope:
  - .oxlintrc.json
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

The root `.oxlintrc.json` enables the `react` and `nextjs` oxlint plugins for the whole repo.
`apps/console` is a Vite + Solid 2 app, not React, so those rules produce false warnings there.
Add a console override that turns the React- and Next.js-specific rules off.

## Why / Context

Examples from `bunx oxlint apps/console`: `react(immutability)` on Solid ref callbacks such as
`let dialog; <dialog ref={(el) => { dialog = el; }}>` (a normal Solid pattern), and
`next(no-html-link-for-pages)` on plain `<a href>` links (the Solid router intercepts plain
anchors by design). Noise like this hides real warnings. Read `AGENTS.md` first; oxlint and oxfmt
are the only lint/format tools in this repo.

## Proposal

1. Run `bunx oxlint apps/console` and note every `react(...)` / `nextjs(...)`/`next(...)`
   diagnostic.
2. Read the installed schema `node_modules/oxlint/configuration_schema.json` to see whether an
   `overrides` entry can set `plugins` (disable whole plugins per path) or only `rules`.
3. Add an `overrides` entry for `apps/console/**` (follow the existing `apps/nest-api/**` override
   as the pattern). Prefer the plugin-level form if supported; otherwise turn off each react/nextjs
   rule individually (list them from the schema, not from memory). Keep `jsx-a11y`, `typescript`,
   `unicorn`, `import` and `oxc` rules active for the console.

## Scope

**In scope:** `.oxlintrc.json` only. **Out of scope:** any source change to silence warnings,
other apps' rules.

## Validation

Paste real output tails into Resolution:
- `bunx oxlint apps/console` — no react/nextjs diagnostics remain; a11y and typescript ones still
  appear if present.
- `bunx oxlint apps/web` — unchanged (React/Next rules still apply to the web app).
- `bun run lint` exits 0.

## Resolution

<Filled by the resolver.>
