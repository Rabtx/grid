---
id: str-console-session-keepalive
title: Keep the console signed in: renew the access token before it expires
type: bug
from: ui-ux
to: web
priority: high
status: open
assignee: none
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

<Filled by the resolver.>
