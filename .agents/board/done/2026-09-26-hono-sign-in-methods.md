---
id: str-hono-sign-in-methods
title: Hono: 2FA, passkeys and Google sign-in
type: feature
from: human
to: backend
priority: normal
status: done
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-auth-core]
branch: agent/backend/hono-sign-in-methods
worktree: ../grid-worktrees/agent/backend/hono-sign-in-methods
scope:
  - apps/api/src/modules/mfa/**
  - apps/api/src/modules/passkeys/**
  - apps/api/src/modules/social-auth/**
  - apps/api/test/contract/mfa*
  - apps/api/test/contract/passkeys*
  - apps/api/test/contract/social*
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Port `modules/mfa` (TOTP, recovery codes, the login challenge), `modules/passkeys` (WebAuthn registration and sign-in) and `modules/social-auth` (Google). They finish sign-in by issuing a session, so they need auth-core's session code.

## Why / Context

After auth-core lands. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.

## Outcome

The last 12 NestJS routes run on Hono: `POST /auth/methods/two-factor/verify`, `/google`,
`/passkeys/options`, `/passkeys/verify`, and `/auth/security` (status, TOTP setup, confirm and
disable, passkey options, register and delete, Google link). Nothing is forwarded to NestJS any
more; the cutover can remove it.

- TOTP is RFC 6238 on `Bun.CryptoHasher` (replaces otplib): same 32-character base32 secrets,
  same `otpauth://` URI, codes accepted from 30 s before to 30 s after. RFC test vectors pass.
- 2FA secrets stay AES-256-GCM (`iv.tag.ciphertext`), now through WebCrypto; a secret encrypted
  by the old code decrypts (tested with the old code's exact steps).
- Google ID tokens are verified with jose against Google's published keys (replaces
  google-auth-library): audience, issuer, RS256, verified email.
- Kept: `@simplewebauthn/server` (WebAuthn is protocol and security code worth not rewriting) and
  `qrcode` (drawing the QR image; nothing built in does it).
- The contract suite's CSRF check moved off `/auth/login`, so a full run fits sign-in's limit.

## Validation

- `bun run typecheck`: 9/9 exited 0. `bun run lint`: exited 0. `bun run architecture:check`: passed.
- Contract suite, now 61 tests (13 new in `security.test.ts`: status, 2FA setup, confirm with a
  code the test computes itself, sign-in challenge, recovery code used once, disable, passkey
  options, fake registration refused, delete errors, passkey sign-in options and unknown
  challenge, Google not configured): **61/61 against NestJS and 61/61 against Hono**.
- apps/api unit tests: 48 passed (TOTP vectors and tolerance, old-format secret decryption,
  recovery-code hashing, Google token checks with a locally signed token).
