---
id: grid-google-sign-in-two-factor
title: ask accounts with an authenticator for their code after google sign-in
type: security
from: pm
to: backend
priority: medium
status: open
assignee: none
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
