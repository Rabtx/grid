---
id: grid-frame-ancestors
title: stop other sites from framing the console
type: security
from: pm
to: frontend
priority: medium
status: done
assignee: claude
reviewer: human
parent: grid-console-csp
depends_on: []
branch: none
worktree: none
scope: [apps/console/vite.config.ts, apps/docs/content/docs/portable.mdx]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The console's CSP (#202) is a meta tag, which can't carry `frame-ancestors`, so any site could frame the console (clickjacking). That needs a response header from whatever serves it.

## Validation

- The headers on the built console.

## Resolution
Fixed by claude, 2026-10-07.

- **Headers:** `vite preview` now sends `Content-Security-Policy: frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` on every response. That's how both the always-on service and the launcher/Docker gateway serve the console. The console's own frames (dev-server previews in the split view) are unaffected, since this only limits who may frame the console.
- **Docs:** the portable docs say so, and that a server serving the built files directly should send the header. Also fixed a run-on sentence from #216.
- **Checked:** a built console on :3041 returned both headers for `/` and for a deep link. Lint and typecheck pass.
