---
id: str-console-login-polish
title: Sign-in polish: return to where you were, show password, calmer session check
type: feature
from: ui-ux
to: web
priority: normal
status: done
assignee: codex (GPT-6)
reviewer: claude
parent: .agents/plans/console-design-migration.md (UX polish round)
depends_on: []
branch: agent/web/console-login-polish
worktree: ../grid-worktrees/agent/web/console-login-polish
port: 3045
scope:
  - apps/console/src/modules/auth/components/login-form.tsx
  - apps/console/src/routes/require-auth.tsx
  - apps/console/src/app.tsx (the LoginRoute function only)
  - apps/console/src/routes/app-shell.test.tsx
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Signing in always lands on the board, even when you opened a task or terminal link; the password cannot be revealed on a phone; and every reload flashes "Checking your session…" text.

## Why / Context

Shared links (`/board/:slug/tasks/:n`, `/terminal/:id`) should survive a sign-in. The session check shows on every cold start of the PWA. Read first, in order: `AGENTS.md`, `DESIGN.md` ("Product tokens (console)", "Interaction"), `.agents/skills/solid-2/SKILL.md` (Solid 2 only — check `apps/console/node_modules/solid-js/types` before using any API), `.agents/skills/mobile-first/SKILL.md`, then the files in scope.

## Proposal (build exactly this)

1. `RequireAuth`: when redirecting to `/login`, pass the current path+search as `?next=`. Only same-origin relative paths are accepted (must start with `/` and not `//`); anything else falls back to `/board`.
2. `LoginRoute` and `LoginForm`: after sign-in, and when an already-signed-in visitor opens `/login`, navigate to `next` (replace).
3. Password field: a show/hide toggle button inside the field (an `IconButton` with a label that says what it does, `aria-pressed`), keeping `autocomplete="current-password"`.
4. Replace the "Checking your session…" line with the brand mark (`BrandMark` from `@/ui`) centred and softly pulsing (off under reduced motion), shown only after 300 ms so fast refreshes show nothing.
5. Tests: `next` round-trip; an off-site `next` is ignored; the toggle switches the input type.

## Scope

**In scope:** the files in `scope`.
**Out of scope:** 2FA, sign-up, password reset, the auth API. Never name any external product or project in code, comments or docs.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `bun --cwd=apps/console run typecheck` · `bun --cwd=apps/console run build`
- `bun run lint` · `bun run format` · `bun run architecture:check`
- Ports 3000–3002, 3011, 4000 and 4100 belong to the human's running servers: do not start or stop
  anything on them. If you need a dev server, use the port on this card.
- If you run a dev server, use port 3045 (`bunx vite --port 3045 --strictPort` in `apps/console`).

## Resolution

Changed:
- `login-form.tsx`: one validated return path for fresh login and restored sessions, accessible
  password toggle with explicit ARIA string values, unchanged password autocomplete.
- `require-auth.tsx`: preserve path+search as next; delayed BrandMark after 300 ms, cleaned-up
  timer, semantic output status and motion-safe pulse.
- `app.tsx`: removed LoginRoute's competing board redirect (and its now-unused useAuth import).
- `app-shell.test.tsx`: deep-link round trips, unsafe paths, restored sessions, visibility toggle,
  and fast/slow session checks. Updated existing session fixtures to use future expiries.

Contract impact: none. LoginRoute delegates redirect handling to LoginForm so both restored and
new sessions use the same validation. No changes to other route functions or the auth API.

Commit: `39d20de237a95902e3add93a0d24220f444e6cf7`.
Review: claude — pending PR review; not merged. Done marks implementation/validation complete per
this session's delivery instructions, not independent review approval.

Validation: every final command below exited 0. Earlier lint failures (semantic status element)
were fixed; an earlier root typecheck was killed by SIGKILL, then passed on rerun. Existing lint
warnings outside scope remain. Final diff contains only card scope plus card lifecycle metadata.

`bun --cwd=apps/console run test` — exit 0:

```text
 RUN  v5.0.1 /home/ghost/Projects/grid-worktrees/agent/web/console-login-polish/apps/console


 Test Files  16 passed (16)
      Tests  110 passed (110)
   Start at  16:57:12
   Duration  5.81s (environment 39%, tests 27%, transform 23%, import 9%, worker 2%)

```

`bun --cwd=apps/console run typecheck` — exit 0:

```text
$ tsc --noEmit
```

`bun --cwd=apps/console run build` — exit 0:

```text
dist/assets/index-BEH4NAsQ.css        51.61 kB │ gzip:   9.81 kB
dist/assets/serverForms-AIHg1ncs.js   19.88 kB │ gzip:   7.70 kB
dist/assets/decode-DPOGVbX0.js        21.77 kB │ gzip:   6.47 kB
dist/assets/routing-C1fmnwoy.js       78.96 kB │ gzip:  28.98 kB
dist/assets/index-DhC1fckN.js         89.80 kB │ gzip:  28.90 kB
dist/assets/terminal-BSQG8Yf7.js     464.89 kB │ gzip: 121.58 kB

✓ built in 760ms
```

`bun run lint` — exit 0:

```text
web lint: src/components/motion/theme-toggle.tsx:120:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/components/motion/theme-toggle.tsx:183:18: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/components/theme/theme-provider.tsx:45:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/modules/auth/components/verify-email-form.tsx:35:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/modules/auth/components/account-profile.tsx:32:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/lib/utils.test.ts:6:43: warning eslint(no-constant-binary-expression): Unexpected constant truthiness on the left-hand side of a "&&" expression help: This expression always evaluates to the constant on the left-hand side
web lint: Exited with code 0
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
```

`bun run format` — exit 0:

```text
$ oxfmt --write . && bun run scripts:format && (cd packages/logger/rust && cargo fmt || true)
Finished in 55ms on 402 files using 4 threads.
$ shfmt -i 4 -w scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh || true
```

`bun run architecture:check` — exit 0:

```text
$ bash scripts/architecture/check-boundaries.sh
Running architecture boundary checks...
Architecture checks passed.
Running kebab-case naming checks...
[naming] OK (503 path(s) checked)
```

`bun run typecheck` — exit 0:

```text
$ bun run --filter '*' typecheck
@grid/logger typecheck: Exited with code 0
runner typecheck: Exited with code 0
console typecheck: Exited with code 0
@grid/ui typecheck: Exited with code 0
web typecheck: Exited with code 0
nest-api typecheck: Exited with code 0
```

`bun --cwd=apps/web run test` — exit 0:

```text
 RUN  v5.0.1 /home/ghost/Projects/grid-worktrees/agent/web/console-login-polish/apps/web


 Test Files  6 passed (6)
      Tests  31 passed (31)
   Start at  16:57:42
   Duration  800ms (transform 52%, tests 23%, import 19%, worker 6%)

```

Browser evidence (installed Chromium, Vite port 3045):

```text
{"liveDeepLinkRoundTrip":true,"restoredSessionRedirect":true,"unsafeNextRejected":true,"toggleBounds":{"x":315,"y":318,"width":44,"height":44},"pageErrors":[]}
{"delayedLoadingMark":true,"reducedMotionAnimation":"none"}
{"noHorizontalOverflowAt":[320,768,1280],"keyboardToggle":true}
```

Live seeded-account sign-in returned to `/board/grid/tasks/1?check=return`. Restored sessions
returned to appearance settings; external next fell back to the board. Screenshots inspected at
375px (login) and 1280px (loading); toggle measured 44x44 on touch. Keyboard focus and Space
activation passed. A controlled task-list response also verified the task title rendered after
live login, with no application console errors (expected initial refresh 401 excluded).

Limitation / reviewer follow-up: the unmocked live deep-link run emitted
`TypeError: tasks(...).find is not a function` from the unchanged
`modules/projects/context/workspace-context.tsx:102`. The redirect URL was correct; this is not
claimed as a clean end-to-end task-data rendering pass. Project data handling is outside this
card's scope. An existing TopBar Show reactive-read warning also remains. New redirect effect
reactive reads were moved to their compute callbacks and revalidated.

Only port 3045 was started/stopped; protected human server ports were untouched.

