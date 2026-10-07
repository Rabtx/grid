---
id: grid-magic-link-console
title: decide magic-link sign-in: add it to the console or remove it from the api
type: decision
from: pm
to: backend
priority: low
status: done
assignee: claude
reviewer: human
parent: grid-console-url
depends_on: []
branch: none
worktree: none
scope: [apps/api/src/modules/auth/**, apps/console/src/modules/auth/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The API still offers magic-link sign-in (`/auth/methods/magic-link/request` and `/consume`), and its emails link to `<console>/magic-link?token=…`. The console has no such page and nothing in it asks for a magic link; only the web app did, and #207 removed it. So the endpoint can send an email whose link leads nowhere.

## Proposal or Ask

Either add a console `/magic-link` page (consume the token, sign in, land on the workspace) and offer it on the login screen, or remove the endpoints and their contract tests. Owner's call.

## Resolution
Done by claude, 2026-10-07. Owner's call: add it.

- **Console:** the sign-in screen has **Email me a sign-in link** on its first step. It leads to "Check your email" (the same answer whether or not the account exists). Outside production, the API returns the link's token, and the console offers "Open the sign-in link here" for a Grid that sends no email.
- **The `/magic-link` page:** it reads the token, clears it from the address bar and history straight away, and signs in. It asks for the two-factor code when the account has one, explains a spent or expired link, then opens the workspace.
- **Reserved name:** `magic-link` is now reserved, both as a workspace slug (`RESERVED_WORKSPACE_SLUGS`) and as a path outside workspaces (the console's `OUTSIDE`, the app shell's sign-in frame).
- **Security fix:** `consumeMagicLink` created a session straight away, so an account with an authenticator could sign in with just its email. It now returns the same two-factor challenge as a password (`presentLogin` on the route). The new PGlite test `auth/magic-link.test.ts` fails on `main` and passes here.
- **Tests:**
  - Console: the login form test covers the request and sent step; new `magic-link.test.tsx` covers signing in and leaving with the token cleared, the code step, and a spent link.
  - Browser, isolated console against the local dev API: "Email me a sign-in link" for the seeded demo account → "Check your email" → "Open the sign-in link here" → signed in on `/chat/grid`, with the token gone from the address.
- **Checks:** API 44 / 44, db 12 / 12, console 720 / 720, typecheck, lint, naming and architecture pass.
- **Filed:** `google-sign-in-two-factor`. Google sign-in also skips two-factor.
