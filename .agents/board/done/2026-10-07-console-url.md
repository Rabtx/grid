---
id: grid-console-url
title: send the api's links and passkeys to the console, not the old web app
type: bug
from: pm
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-trim-web-app
depends_on: []
branch: none
worktree: none
scope: [apps/api/src/config/**, apps/api/src/modules/**, apps/api/.env.example, docker/compose/api.yml, env.docker.example, apps/docs/content/docs/deploy.mdx]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

`WEB_APP_URL` (default `:3000`, the landing site since #207) builds invite and magic-link emails and billing returns. `WEBAUTHN_ORIGIN` defaults to `:3000`, and `CORS_ORIGIN` still lists it. Invites link to a page that only exists in the console.

## Validation

- Config tests; the API suite.

## Resolution
Fixed by claude, 2026-10-07.

- **`CONSOLE_URL`** (default `http://localhost:3001`) now builds invite links, magic-link emails and billing return URLs. `WEB_APP_URL` is still read when `CONSOLE_URL` isn't set.
- **Passkeys:** `WEBAUTHN_ORIGIN` defaults to the console, where passkeys are added and used.
- **Allowed callers:** the default `CORS_ORIGIN` drops the landing site, which no longer calls the API.
- **Docs and examples** use the new names: `apps/api/.env.example`, `env.docker.example`, the API compose file and `docs/deploy.mdx`.
- **Tests:** new `config/config.test.ts` covers the defaults, the precedence and the fallback. API 42 / 42, typecheck and lint pass. The contract tests already use the console origin.
- **Filed:** `magic-link-console`. The console has no magic-link page, so whether to build one or drop the endpoints is the owner's call.
- **Deployments:** set `CONSOLE_URL` and `WEBAUTHN_ORIGIN` to the address people open the console on (with a matching `WEBAUTHN_RP_ID`). On the owner's machine that's the Tailscale URL, otherwise invite links say localhost.
