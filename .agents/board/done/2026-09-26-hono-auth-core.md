---
id: str-hono-auth-core
title: Hono: users, sessions and core sign-in
type: feature
from: human
to: backend
priority: high
status: done
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-foundation]
branch: agent/backend/hono-auth-core
worktree: ../grid-worktrees/agent/backend/hono-auth-core
scope:
  - apps/api/src/modules/auth/**
  - apps/api/src/modules/users/**
  - apps/api/src/modules/email/**
  - apps/api/test/contract/auth*
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Port `modules/auth` (register, login, refresh, logout, sessions list/revoke, email verification, password reset, OTP and magic link, CSRF check), `modules/users` and `modules/email`. `Bun.password` replaces bcryptjs and must verify existing bcrypt hashes. Same cookies (name, attributes, path) and the same native-client behaviour (refresh token in the body for native apps).

## Why / Context

Security-critical; owned by the lead. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.

## Outcome

Hono now serves 16 auth routes: register, verify-email, resend-verification, login (including
handing 2FA accounts a challenge), refresh (rotation, with reuse treated as theft), logout,
logout-all, me, forgot/reset/change password, session list and revoke, `GET /auth/methods`, and
magic-link request/consume. `modules/users` and `modules/email` came with them. 2FA completion,
passkeys, Google and `/auth/security/*` still fall through to NestJS (next card).

- Same order of checks as NestJS: rate limit → CSRF → sign-in → body validation. The same limits,
  cookie (name, path, HttpOnly, SameSite, Secure rules, 30-day Max-Age), native-client handling,
  error codes and messages. Malformed JSON is a 400 with the parser's message; a bad session id
  is "Validation failed (uuid v 4 is expected)", as before.
- `@grid/db/password`: bcrypt through `Bun.password`, cut to bcrypt's 72 bytes. Without that cut,
  every existing password longer than 72 bytes would have stopped working (checked against
  bcryptjs both ways).
- HMACs and hashes use `Bun.CryptoHasher`; codes, challenge tokens and refresh tokens are made
  and hashed exactly as NestJS did, so a code, challenge or session from one works on the other.
- Express's `req.ip` rule is kept for session IPs and rate limits (behind one trusted proxy, the
  last `X-Forwarded-For` hop).

## Validation

- `bun run typecheck`: 9/9 packages exited 0. `bun run lint`: exited 0.
  `bun run architecture:check`: passed.
- Contract suite (21 tests: one throwaway account through sign-up, verification, login, native
  login, me, refresh rotation and reuse, sessions, password change, CSRF, reset, magic link,
  providers, logout, logout-all): **21/21 against NestJS and 21/21 against Hono**.
- apps/api unit tests: 23 passed, including crypto parity with NestJS's formulas and
  database-backed sign-in rules (lockout after N failures, reset of the counter, inactive and
  password-less accounts, the 2FA challenge, codes closing after too many tries).
- packages/db: 4 passed (bcrypt compatibility with a real bcryptjs hash). apps/nest-api: 26 passed.
- Side by side: a Hono session works on routes NestJS still serves and NestJS accepts its token;
  a NestJS-issued refresh cookie refreshes on Hono and the reverse.
- Browser, dev console pointed at this branch's Hono: the existing session refreshed (200), then
  sign out (204) and sign in (200) through the UI back into the workspace.
