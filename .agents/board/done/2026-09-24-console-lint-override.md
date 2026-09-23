---
id: str-console-lint-override
title: Stop React and Next.js lint rules firing on the Solid console
type: chore
from: human
to: pm
priority: normal
status: done
assignee: buffy (deepseek-v4-flash)
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

### Baseline diagnostics

`bunx oxlint apps/console` before the change: 8 warnings, all react/nextjs —
6 × `react(immutability)` (`src/ui/sheet.tsx`, `dialog.tsx`, …) and
2 × `next(no-html-link-for-pages)` (`src/app.tsx`).

### What changed

`.oxlintrc.json` only: one new `overrides` entry for `apps/console/**/*.ts` and
`apps/console/**/*.tsx` that sets every rule of the `react` (85) and `nextjs` (21) plugins to
`"off"`. The 106 rule names were generated from
`node_modules/oxlint/configuration_schema.json` (`definitions.DummyRuleMap.properties`), not from
memory, and follow the existing `apps/nest-api/**` override as the pattern. `jsx-a11y`,
`typescript`, `unicorn`, `import` and `oxc` rules stay active for the console; no source file and
no other app's configuration changed.

### Why the plugin-level form was rejected (evidence)

`overrides[n].plugins` **is** in the installed schema ("Optionally change what plugins are enabled
for this override. When omitted, the base config's plugins are used."), so it was tried first.
At runtime (oxlint 1.85.0) it does not remove the base plugins for the matched files. Two probe
configs (base plugins incl. `react`/`nextjs`; console override with
`plugins: ["unicorn","typescript","oxc","import","jsx-a11y"]`) still reported the same 8
diagnostics — probe B additionally set the `react/*`/`nextjs/*` rules referenced by the root
config to `"off"` inside the override, with the same result:

```text
===== probe a =====
      2   ! next(no-html-link-for-pages): Do not use `<a>` elements to navigate between Next.js pages.
      3   ! react(immutability): Cannot modify local variables after render completes
      3   ! react(immutability): Cannot reassign variable after render completes
Found 8 warnings and 0 errors.

===== probe b =====
      2   ! next(no-html-link-for-pages): ...
      3   ! react(immutability): Cannot modify local variables after render completes
      3   ! react(immutability): Cannot reassign variable after render completes
Found 8 warnings and 0 errors.
```

A third probe with `react`/`nextjs` removed from the top-level `plugins` list reported
`Found 0 warnings and 0 errors.` for `apps/console`, which confirms both that the diagnostics are
plugin-driven and that only the per-rule form takes effect. The three probe files were deleted;
they were never staged or committed.

### Validation output

Card command 1 — console clean, and a11y/typescript still enforced. The probe below is a
throwaway `apps/console/src/__lint-probe.tsx` (`const value: any = 1` + `<a onClick={…}>`), run to
prove the override does not silence the other plugins; it was deleted afterwards.

```text
$ bunx oxlint apps/console
Found 0 warnings and 0 errors.
Finished in 134ms on 45 files with 192 rules using 4 threads.

$ bunx oxlint apps/console/src/__lint-probe.tsx     # temporary probe, since deleted
  ! typescript(no-explicit-any): Unexpected `any`. Specify a different type.
  ! jsx-a11y(anchor-is-valid): The `a` element has `href` and `onClick`.
Found 2 warnings and 2 errors.
```

Card command 2 — `apps/web` unchanged: the same 9 warnings as with the pre-change config
(`git show HEAD:.oxlintrc.json` used as the baseline), rule for rule — 7 ×
`react(set-state-in-effect)`, 1 × `jsx-a11y(no-autofocus)`, 1 ×
`eslint(no-constant-binary-expression)`.

```text
$ bunx oxlint apps/web
Found 9 warnings and 0 errors.
Finished in 248ms on 112 files with 192 rules using 4 threads.
```

Card command 3 — root lint, including the per-workspace runs and shellcheck:

```text
$ bun run lint
console lint: Found 0 warnings and 0 errors.
console lint: Finished in 306ms on 45 files with 192 rules using 4 threads.
console lint: Exited with code 0
web lint: Found 9 warnings and 0 errors.
web lint: Exited with code 0
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
LINT_EXIT=0
```

Formatting also run per `AGENTS.md`; it left the new JSON as written and touched no other file:

```text
$ bun run format
Finished in 37ms on 357 files using 4 threads.
$ git status --short
R  .agents/board/open/2026-09-24-console-lint-override.md -> .agents/board/done/2026-09-24-console-lint-override.md
 M .oxlintrc.json
```

### Changed

- `.oxlintrc.json` (+111 lines: the `apps/console/**` override entry)
- `.agents/board/2026-09-24-console-lint-override.md` (card lifecycle: open → done)

### Contract impact

- none: lint configuration only, no application code, API, schema or design contract changed.

### Review

- reviewer: claude (card frontmatter) — review pending; branch pushed and PR opened, not merged.

### Known limitation

New `react/*` / `nextjs/*` rules added by future oxlint releases will fire in `apps/console`
again until they are listed in this override, because oxlint offers no working per-path plugin
switch (see above). Same trade-off the existing `apps/nest-api/**` override already accepts.

### Commit

- `f7d99ff` — `chore(lint): silence react and nextjs rules on the solid console` (config + card).
  That hash was inserted by an amend right after the commit (a commit cannot contain its own hash),
  so the branch tip differs from it by the amend only; `git log agent/pm/console-lint-override` is
  authoritative.
- PR: https://github.com/shabirkhan-dev/grid/pull/26 (open, awaiting review; not merged).
