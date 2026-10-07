---
id: grid-trim-web-app
title: trim apps/web to the landing site it is meant to be
type: chore
from: pm
to: web
priority: normal
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/web/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

`apps/web` still ships sign-in, sign-up, password reset, magic link, 2FA, admin and board pages (`apps/web/src/app/*`), untouched since 2026-09-22. AGENTS.md says it is to become the landing site only; the console replaced all of this.

## Proposal or Ask

Remove the product pages and their modules, keeping the landing page, and keep its build and e2e passing.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution
Fixed by claude, 2026-10-07.

- **Removed (81 files):** `apps/web` is now the landing page only. Gone are its sign-in, sign-up, forgot and reset password, magic link, email verification, account, admin and board pages, along with the `auth`, `projects` and `users` modules, the API client, the auth context and the React Query provider.
- **What it keeps:** the landing page, its layout, the Open Graph image, robots and sitemap.
- **Dependencies:** `@tanstack/react-query` and `@simplewebauthn/browser` are dropped; the remote image hosts only the admin used are gone from `next.config`.
- **Links:** "Sign in" and "Open Grid" now go to the console (`NEXT_PUBLIC_CONSOLE_URL`, default `http://localhost:3001`) instead of the deleted `/login` and `/admin`. A test covers this.
- **Deploy config:** the web image needs no API. `NEXT_PUBLIC_API_URL` and the web container's dependency on `api` are replaced by `NEXT_PUBLIC_CONSOLE_URL`, in the Dockerfile, compose, the env examples, and the docker, deploy and apps-overview docs.
- **Repo descriptions:** AGENTS.md, PROJECT.md and README describe the web app as the landing page.
- **Checks:**
  - `next build` produces six static routes: `/`, `_not-found`, icon, OG image, robots, sitemap.
  - The Playwright e2e (`home.spec.ts`) passes, and web unit tests pass 9/9.
  - The built page links only to `http://localhost:3001` and `/login` on it.
  - Typecheck, lint, format and architecture checks pass.
