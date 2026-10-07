---
id: grid-google-sign-in-two-factor
title: ask accounts with an authenticator for their code after google sign-in
type: security
from: pm
to: backend
priority: medium
status: done
assignee: claude
reviewer: human
parent: grid-magic-link-console
depends_on: []
branch: none
worktree: none
scope: [apps/api/src/modules/auth/**, apps/console/src/modules/auth/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

`POST /auth/methods/google` signs in with `flows.createSession` directly, so an account with two-factor turned on never gives its code after a Google sign-in. A password and (since this card's parent) a magic link both stop at the two-factor step.

## Proposal or Ask

Return `mfaChallenge` for accounts with TOTP enabled, as `login` and `consumeMagicLink` do, through `presentLogin`, and have the console's Google sign-in show the code step. Passkeys can stay as they are (a passkey is already two factors).

## Validation

- A PGlite test: a Google sign-in for an account with an authenticator gets the challenge, not a session.

## Resolution
Fixed by claude, 2026-10-07.

- **One shared check:** `flows.signInAs` ends every first-factor sign-in with a session, or a two-factor challenge for an account with an authenticator. It's used by password `login`, `consumeMagicLink` and now `POST /auth/methods/google`, which used `createSession` directly and so skipped the code. The Google route answers through `presentLogin`, the same as `/auth/login`.
- **Console:** it has no Google sign-in button today, so nothing changes there. Any client that adds one finishes with `/auth/methods/two-factor/verify`, as after a password.
- **Tests:** new PGlite `social/google-two-factor.test.ts`, with a real signed ID token through `linkGoogle` and `authenticateGoogle`. An account without an authenticator gets a session. An account with one gets `requiresTwoFactor` and no session is created. The route's switch to `signInAs` is a one-line change, checked by reading rather than end to end.
- **Checks:** API 46 / 46, typecheck and lint pass.
