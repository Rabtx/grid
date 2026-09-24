---
id: str-console-session-keepalive
title: Keep the console signed in: renew the access token before it expires
type: bug
from: ui-ux
to: web
priority: high
status: done
assignee: codex (GPT-6)
reviewer: claude
parent: .agents/plans/console-design-migration.md (UX polish round)
depends_on: []
branch: agent/web/console-session-keepalive
worktree: ../grid-worktrees/agent/web/console-session-keepalive
port: 3041
scope:
  - apps/console/src/modules/auth/**
  - apps/console/src/lib/api-client.ts
  - apps/console/src/lib/api-client.test.ts
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

The console holds a 15-minute access token and never renews it, so after 15 minutes the board and every API call fail with 401 until a reload. Renew it on a schedule and retry once on a 401.

## Why / Context

Access tokens expire after `JWT_ACCESS_EXPIRES_IN=15m` (`apps/nest-api/src/modules/auth/auth-crypto.service.ts`). `auth-context.tsx` already has `renew()` (deduped; signs out only when the API refuses the refresh with 401, keeps the session on network errors) — the terminal uses it. Nothing else does. Read first, in order: `AGENTS.md`, `DESIGN.md` ("Product tokens (console)", "Interaction"), `.agents/skills/solid-2/SKILL.md` (Solid 2 only — check `apps/console/node_modules/solid-js/types` before using any API), `.agents/skills/mobile-first/SKILL.md`, then the files in scope.

## Proposal (build exactly this)

1. After every login/refresh, schedule `renew()` ~60 s before the token's expiry (read the expiry from the session response — check `types/auth.types.ts` and the API response; if it is absent, decode the JWT `exp` claim without verifying). Clear the timer on logout.
2. When the page becomes visible again (`visibilitychange`) and the token is past, or within 60 s of, expiry, renew at once — phones freeze timers in the background.
3. In `lib/api-client.ts`, give the auth context a way to plug in: on a 401 for a request made with an `accessToken`, call the renew hook once, and retry that request with the new token. Concurrent 401s share one renewal (the existing dedupe). If renewal returns null, throw the original error (RequireAuth sends the person to /login).
4. The token stays in memory only. Never persist it.
5. Tests (vitest): the scheduled renewal fires before expiry (fake timers); a 401 triggers exactly one renew and one retry; two concurrent 401s share one renewal; a refused refresh signs out.

Done when a console left open for 20+ minutes still loads the board without a reload.

## Scope

**In scope:** the files in `scope`.
**Out of scope:** the API, the terminal module (already uses `renew()`), UI changes. Never name any external product or project in code, comments or docs.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `bun --cwd=apps/console run typecheck` · `bun --cwd=apps/console run build`
- `bun run lint` · `bun run format` · `bun run architecture:check`
- Ports 3000–3002, 3011, 4000 and 4100 belong to the human's running servers: do not start or stop
  anything on them. If you need a dev server, use the port on this card.
- If you run a dev server, use port 3041 (`bunx vite --port 3041 --strictPort` in `apps/console`).

## Resolution

Implemented scheduled renewal 60 seconds before the API-provided expiry, visibility wake-up
renewal, and one authenticated-request retry through the mounted auth provider. Concurrent
requests share refresh; delayed 401s reuse a newer token. Tokens remain in memory. Logout and
provider disposal clear timers; late refresh results cannot restore a logged-out session.
Transient refresh failures preserve the session and retry after 30 seconds.

Changed:
- `apps/console/src/modules/auth/context/auth-context.tsx`
- `apps/console/src/modules/auth/context/auth-context.test.tsx`
- `apps/console/src/lib/api-client.ts`
- `apps/console/src/lib/api-client.test.ts`

Contract impact: none; verified `accessTokenExpiresAt` in the existing response types and API
session presenter. Checked installed Solid 2 typings, including `onSettled` cleanup.

Commit: `b29b6b4633e6fc6aeee116780abc16e41115e49d` (implementation and tests).
Review: claude — pending independent PR review; not merged. Moved to done at the human's explicit
request after implementation and validation; this status does not claim review approval.

Card provenance: the supplied card was absent from main; imported this exact card from committed
PM branch `fc29262`. No other PM cards or application files were imported.

Validation: all commands below exited 0. Existing lint warnings outside scope remain. Root
formatting and commit hooks left no unrelated tracked changes.

`bun --cwd=apps/console run test` — exit 0:

```text
 RUN  v5.0.1 /home/ghost/Projects/grid-worktrees/agent/web/console-session-keepalive/apps/console


 Test Files  15 passed (15)
      Tests  91 passed (91)
   Start at  16:17:28
   Duration  5.25s (environment 38%, tests 29%, transform 21%, import 10%, worker 2%)

```

`bun --cwd=apps/console run typecheck` — exit 0:

```text
$ tsc --noEmit
```

`bun --cwd=apps/console run build` — exit 0:

```text
dist/assets/index-Ce-K6uRQ.css        49.78 kB │ gzip:   9.50 kB
dist/assets/serverForms-jW7ekei8.js   19.88 kB │ gzip:   7.70 kB
dist/assets/decode-DPOGVbX0.js        21.77 kB │ gzip:   6.47 kB
dist/assets/routing-C1fmnwoy.js       78.96 kB │ gzip:  28.98 kB
dist/assets/index-DSUVAAB_.js         84.38 kB │ gzip:  27.05 kB
dist/assets/terminal-DYup7H1u.js     464.89 kB │ gzip: 121.58 kB

✓ built in 793ms
```

`bun run lint` — exit 0:

```text
web lint: src/modules/auth/context/auth-context.tsx:62:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/components/theme/theme-provider.tsx:45:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/components/motion/theme-toggle.tsx:120:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/components/motion/theme-toggle.tsx:183:18: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/modules/auth/components/account-profile.tsx:32:3: warning react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
web lint: src/lib/utils.test.ts:6:43: warning eslint(no-constant-binary-expression): Unexpected constant truthiness on the left-hand side of a "&&" expression help: This expression always evaluates to the constant on the left-hand side
web lint: Exited with code 0
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
```

`bun run format` — exit 0:

```text
$ oxfmt --write . && bun run scripts:format && (cd packages/logger/rust && cargo fmt || true)
Finished in 33ms on 399 files using 4 threads.
$ shfmt -i 4 -w scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh || true
```

`bun run architecture:check` — exit 0:

```text
$ bash scripts/architecture/check-boundaries.sh
Running architecture boundary checks...
Architecture checks passed.
Running kebab-case naming checks...
[naming] OK (500 path(s) checked)
```

`bun run typecheck` — exit 0:

```text
$ bun run --filter '*' typecheck
@grid/logger typecheck: Exited with code 0
runner typecheck: Exited with code 0
console typecheck: Exited with code 0
@grid/ui typecheck: Exited with code 0
nest-api typecheck: Exited with code 0
web typecheck: Exited with code 0
```

`bun --cwd=apps/web run test` — exit 0:

```text
 RUN  v5.0.1 /home/ghost/Projects/grid-worktrees/agent/web/console-session-keepalive/apps/web


 Test Files  6 passed (6)
      Tests  31 passed (31)
   Start at  16:18:07
   Duration  670ms (transform 43%, import 25%, tests 24%, worker 9%)

```

Browser validation (Chromium, worktree Vite on port 3041 only):
- Accelerated 21-minute session with mocked API responses: scheduled refresh occurred, then
  settings → board client navigation loaded the board without reloading the page. Output:

```text
{"scenario":"accelerated 21-minute browser session, scheduled renewal and board navigation","refreshes":2,"protectedCalls":5,"pageErrors":[]}
```

- Separate live API smoke: seeded demo login and settings → board navigation passed. Output:

```text
{"scenario":"live seeded-account login and board navigation","url":"http://localhost:3041/board/grid","pageErrors":[]}
```

The 21-minute check used an accelerated browser clock, not a real-time 20-minute soak against
live token expiry. Bundled Playwright Chromium was unavailable; used installed Chromium.
No service was started or stopped on ports 3000–3002, 3011, 4000 or 4100.

