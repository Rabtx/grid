---
id: grid-magic-link-console
title: decide magic-link sign-in: add it to the console or remove it from the api
type: decision
from: pm
to: backend
priority: low
status: open
assignee: none
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
