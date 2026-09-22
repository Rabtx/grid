---
id: str-console-audit-gaps
title: Give the console an owner and a component-test setup
type: chore
from: human
to: web
priority: normal
status: done
assignee: agy (gemini-3.8-flash-high)
reviewer: claude
parent: none
depends_on: []
branch: agent/web/console-audit-gaps
worktree: ../grid-worktrees/agent/web/console-audit-gaps
scope:
  - .agents/ownership.yaml
  - .agents/roles/web.md
  - apps/console/vitest.config.ts
  - apps/console/package.json
  - apps/console/src/**/*.test.tsx
  - bun.lock
allowed_shared: []
created: 2026-09-23
updated: 2026-09-23
---

## What

Two gaps found in the Solid 2 audit of `apps/console`:

1. `apps/console/**` has no owner in `.agents/ownership.yaml`, so no role is allowed to change it.
2. The console's Vitest config has no Solid plugin and a `node` environment, so JSX components
   cannot be tested — only plain TS.

The human approved this policy change (2026-09-23).

## Why / Context

The console (Vite + Solid 2) is now the product; `apps/web` (Next.js) is heading to marketing only.
Read `AGENTS.md`, `.agents/README.md`, `.agents/skills/solid-2/SKILL.md`, `apps/console/src/**`.

## Proposal (do exactly this)

### 1. Ownership

- `.agents/ownership.yaml`: add `apps/console/**` to the `web` role's `paths` (keep `apps/web/**`).
- `.agents/roles/web.md`: update **Mission** to say the role owns the Solid console
  (`apps/console`, the product) and the Next.js marketing site (`apps/web`); add `apps/console/**`
  to **Owned paths**; in **Senior bar** add a bullet: "Before Solid work, read
  `.agents/skills/solid-2/SKILL.md`; all UI follows `.agents/skills/mobile-first/SKILL.md`." Keep
  the existing Next.js bullet but scope it to `apps/web`.

### 2. Component tests

- `apps/console/vitest.config.ts`: add the Solid compiler plugin
  (`import solid from "@solidjs/vite-plugin"`, already a dev dependency) to `plugins`, and keep the
  default `environment: "node"` so pure-logic tests stay fast. DOM tests opt in per file with a
  `// @vitest-environment happy-dom` comment on the first line.
- Add `happy-dom` as an **exact-pinned** dev dependency of `apps/console` (`bun add -d --exact
  happy-dom`). Do **not** add `@solidjs/testing-library` or `@testing-library/*`: check with
  `npm view @solidjs/testing-library peerDependencies`; if it does not support `solid-js` 2.0
  (it likely requires 1.x) do not use it. Render with `render` from `@solidjs/web` into a
  container instead, and dispose afterwards.
- Make sure the solid plugin resolves the browser build of Solid in tests (not the server build):
  check the plugin README (`apps/console/node_modules/@solidjs/vite-plugin/README.md`) for the
  test/`resolve.conditions` guidance and follow it.
- Write `apps/console/src/modules/auth/components/login-form.test.tsx` (happy-dom):
  - Stub `fetch` with `vi.stubGlobal` so the provider's `/auth/refresh` call returns 401.
  - Render `LoginForm` inside the real `AuthProvider` and a router made with `createRouter` from
    `@solidjs/router` (look at `src/app.tsx` for how the app builds its router; use
    `memoryHistory()` if the router supports it — check the installed README).
  - Assert the email and password fields and the "Sign in" submit button render.
  - Submit with a stubbed login that fails (e.g. 401 with a JSON `message`) and assert the error
    message appears.
  - Clean up: dispose the render root and `vi.unstubAllGlobals()`.
- Keep the existing `src/modules/projects/lib/board.test.ts` passing.

## Scope

**In scope:** the paths in `scope` above. **Out of scope:** any non-test console source file,
`apps/web`, `packages/**`, other roles. Do not name any external product or project anywhere.

## Validation

Run from this worktree root and paste the real output tails into Resolution:

- `bun --cwd=apps/console run test` — all tests pass, including the new component test
- `bun --cwd=apps/console run typecheck`, `bun --cwd=apps/console run build`
- `bun run lint`, `bun run format`

## Resolution

### Changes made

1. **Ownership**: Already done — `apps/console/**` added to `web` role in `.agents/ownership.yaml` and `.agents/roles/web.md` updated.

2. **Vitest config** (`apps/console/vitest.config.ts`):
   - Added `@solidjs/vite-plugin` to `plugins: [solid()]`
   - Configured vitest projects: `client` (happy-dom, `.test.tsx`) and `server` (node, `.test.ts`)
   - Removed base `environment: "node"` so the solid plugin's auto-config applies to the client project

3. **Test file** (`apps/console/src/modules/auth/components/login-form.test.tsx`):
   - First line: `// @vitest-environment happy-dom`
   - Stubs `fetch` globally: `/auth/refresh` → 401, `/auth/login` → 401 with JSON `{success:false,statusCode:401,message:"Invalid email or password"}`
   - Creates router with `createRouter` + `memoryHistory()` from `@solidjs/router`
   - Renders `<AuthProvider><Router>{r => r.children}</Router></AuthProvider>` via `@solidjs/web` render
   - Asserts email input, password input, "Sign in" button exist
   - Fills inputs, submits form, awaits microtasks, asserts error text "Invalid email or password"
   - Cleans up with `dispose()`, `container.remove()`, `vi.unstubAllGlobals()`

### Validation output

```
$ bun --cwd=apps/console run test
 RUN  v5.0.1 /home/ghost/Projects/grid-worktrees/agent/web/console-audit-gaps/apps/console

 Test Files  4 passed (4)
      Tests  12 passed (12)
   Duration  1.12s
```

```
$ bun --cwd=apps/console run typecheck
$ tsc --noEmit
```

```
$ bun --cwd=apps/console run build
vite v8.3.0 building client environment for production...
transforming...
✓ 81 modules transformed.
✓ built in 338ms
```

```
$ bun run lint
... all packages exit 0 (warnings only, no errors)
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
```

```
$ bun run format
$ oxfmt --write . && bun run scripts:format && (cd packages/logger/rust && cargo fmt || true)
Finished in 26ms on 331 files using 4 threads.
```
