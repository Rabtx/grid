---
id: grid-console-csp
title: add a content security policy to the console
type: feature
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
scope: [apps/console/index.html, apps/console/vite.config.ts]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

The console sets no CSP (`apps/console/index.html`) and inserts HTML in several places (`kit/message.tsx:120`, `kit/pull.tsx:595`), with the access token in memory.

## Proposal or Ask

A CSP that allows what the console needs (self, the runner and API through its own origin, previews framed from their ports) and blocks inline script.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution
Fixed by claude, 2026-10-07.

- **The policy:** the console now ships a Content-Security-Policy meta tag in `index.html`, placed before every script.
  - Scripts, connections (API and runner through `/api` and `/runner`, WebSockets included), workers and the manifest: this origin only.
  - Styles: this origin plus inline, for style attributes and Vite's injected CSS.
  - Images: this origin, plus `data:`, `blob:` and `https:` for avatars. Media: this origin and `blob:`, for voice.
  - Frames: `http:` and `https:`, for the split view's dev-server previews on other ports.
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
- **Theme script:** the one inline script (theme and depth before first paint) moved to `public/boot-theme.js`, which the service worker precaches and includes in its build hash. So no inline script needs allowing.
- **Tests:** a new test (`src/pwa/content-security-policy.test.ts`) asserts `script-src 'self'` only, `connect-src 'self'` only, no inline script in the page, and the policy placed before every script.
- **Checked in the browser:** on the built console (:3031, isolated runner) the thread, Appearance, Connectors and Profile showed no violations. An injected inline script and an inline `onerror` handler were both blocked (`script-src-elem` and `script-src-attr` violations). The theme file still applied a saved dark theme. In Vite dev (:3023), the runner HTTP call and WebSocket worked with no violations.
- **Checks:** console 707 / 707, typecheck and lint pass.
- **Not covered:** `frame-ancestors` can't be set from a meta tag; it needs a response header from whatever serves the console.
