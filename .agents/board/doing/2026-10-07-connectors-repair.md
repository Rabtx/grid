---
id: grid-connectors-repair
title: make connectors and mcp servers actually connect, by api key and by sign-in
type: bug
from: human
to: backend
priority: high
status: doing
assignee: Codex (backend)
reviewer: pm
parent: none
depends_on: []
branch: agent/backend/connectors-repair
worktree: /home/ghost/Projects/grid-worktrees/agent/backend/connectors-repair
scope: [apps/runner/src/connectors/**, apps/console/src/modules/connectors/**]
allowed_shared: [apps/runner/src/server.ts, apps/runner/src/main.ts, apps/runner/src/agents/provider.ts]
created: 2026-10-07
updated: 2026-10-07
---

## What

The owner can't connect any connector or MCP server from Settings → Connectors. Find out why, fix it, and confirm every connection method works end to end: connectors that use an **API key or token**, connectors that use **sign-in (OAuth)**, and **custom MCP servers** (stdio command and remote URL).

## Why / Context

Connectors were built on 2026-10-04 (`apps/runner/src/connectors/`: `catalog.ts`, `service.ts`, `oauth.ts`, `vault.ts`, `mcp-client.ts`, `proxy.ts`, `routes.ts`; console in `apps/console/src/modules/connectors/`: `connect-dialog.tsx`, `mcp-server-dialog.tsx`, `oauth-callback.tsx`). It has unit tests but has never been confirmed against real services. Likely problem areas: OAuth redirect URLs and the callback route behind the console proxy, client registration (dynamic client registration for MCP OAuth), secrets in the vault, the MCP handshake and tool listing, and errors that never reach the screen. Agents must also actually receive connected tools: check how `agents/provider.ts` passes MCP config to each agent.

## Proposal or Ask

Definition of done:

- Reproduce the failure first and record the exact cause or causes on this card.
- At least one API-key connector, one OAuth connector and one custom MCP server (stdio and remote) connect, list their tools, survive a runner restart, and can be disconnected.
- Every failure shows a clear, actionable error in the dialog. Nothing fails silently.
- A connected tool is available to an agent in a chat. Show it with a test, and with a real check where no paid turn is needed.
- Secrets stay in the vault, are never logged, and never come back to the browser.
- If a catalog entry can't work as listed (for example it needs an OAuth app Grid doesn't have), fix the entry or remove it rather than offering a broken button.

## Scope

**In scope:** the paths in `scope`. In `allowed_shared`, touch only route wiring and the MCP config handed to agents.

**Out of scope:** the Skills page (`2026-10-07-settings-skills.md`), billing, and adding new catalog entries beyond what's needed to verify each method.

## Validation

- A regression test for each confirmed bug, failing before the fix and passing after.
- Runner and console suites, root lint, format, typecheck and architecture checks.
- Manual end-to-end check in the browser against a runner on a spare port with its own data directory, never the live runner or chat database. Record which connectors you tested and how.
- No paid agent turns. Open a PR, record evidence here, and PM verifies before merge.

## Resolution

### Reproduction and cause

- The broad report (“no connector or MCP server can connect”) did not reproduce against the isolated runner for this checkout. The Console `/runner` proxy returned the connector catalog, and both catalog and custom MCP connections succeeded against local mock services. DNS `localhost` resolution and its preference for `::1` did not break this setup.
- A concrete stdio MCP failure did reproduce: when a local MCP process exited before answering `initialize`, the runner synthesized an error response with a string request ID although the original JSON-RPC ID was numeric. The request waiter discarded that response and eventually returned the vague `No answer to initialize` timeout. The transport now retains the original ID, wakes the matching waiter on child exit or a broken pipe, and reports an actionable message. `connectors.test.ts` has a regression test that failed before the fix and passes now.
- This explains an opaque failure for an invalid, missing, or prematurely exiting local command; it does not establish the cause of the owner's reported broad outage. The reported blanket failure remains unreproduced in this environment.

### Isolated connection evidence

All runner checks used port `4111` and the unique data directory `/tmp/grid-connectors-repair.mrqRQr`; the local mock API/MCP endpoints used `4112` and `4113`. The Console Vite server on `3111` proxied `/runner` to that test runner. No live runner, live chat database, real user credential, external OAuth registration, or paid agent turn was used.

- **API-key catalog connector:** connected to a bearer-protected mock Slack MCP server, listed `list_channels`, and persisted its key in the encrypted vault. With the saved record pointed at the local mock MCP endpoint, the actual runner was stopped and restarted against the same database; `POST /connectors/:id/test` returned HTTP 200, healthy, and `list_channels`. It was then disconnected. Neither the test response nor connection view returned the token.
- **OAuth connector:** exercised the Linear sign-in path with an injected local OAuth provider: dynamic client registration, PKCE authorization URL, callback code exchange, tool listing, and encrypted grant persistence all succeeded. For the actual runner restart check, the saved record pointed at the local mock MCP endpoint while retaining its OAuth grant in the encrypted vault. After restart, `POST /connectors/:id/test` returned HTTP 200, healthy, and `list_issues`; it was then disconnected. The token was absent from the test response and connection view. This validates the local OAuth flow but does not validate an interactive browser sign-in against a real provider.
- **Custom remote MCP:** through the Console `/runner` proxy, connected to a local bearer-protected URL, listed `whoami` and `echo`, rechecked healthy, and disconnected. The secret was absent from the connection view.
- **Custom stdio MCP:** connected to a local fake MCP command, listed `list_tables`, `query`, `drop_table`, and `whoami`, rechecked healthy after an actual runner restart on port `4111` with the same isolated data directory, then disconnected. The environment secret was held by a vault reference and absent from the connection view. The remote URL connection also survived that runner restart and recheck.
- **Agent tool delivery (no model turn):** started the actual local agent MCP proxy against the isolated test database, initialized it as an agent stdio client, listed the remote tools, called `whoami` successfully through the proxy, and observed completed tool activity. The key was not present in the proxy server specification.
- **Failure feedback:** the regression covers a child process exiting before the MCP handshake; its clear transport error now propagates to the caller instead of timing out without context.

### Checks

- `bun --cwd=apps/runner run test` — **PASS**, 457 tests, 0 failures.
- `bun --cwd=apps/console run test` — **PASS**, 116 files, 647 tests.
- `bun run lint` — **PASS** (existing warnings in unrelated files).
- `bun run format` — **PASS**.
- `bun run typecheck` — **PASS**.
- `bun run architecture:check` — **PASS**.
- Manual browser inspection could not be completed: the available CUA browser surface reported no browser or tabs, and attempts to open the in-app browser and Chrome returned “Browser is not available.” The proxy and connection flows were exercised by requests against the isolated Vite/runner processes instead.

### Review

- PM review: pending.
- Pull request: [#183 — fix(connectors): surface stopped mcp commands](https://github.com/shabirkhan-dev/grid/pull/183) (draft).

## PM review (2026-10-07)

The early-exit fix and its regression test are accepted, and the PR is merged into the integration
branch `agent/pm/integration`. PM also checked the live screens: the connect dialogs open and work,
GitHub shows connected and healthy, and the dev logs contain no connector errors. The card stays in
`doing` until the owner reports exactly which connector failed and how, so the broader failure can
be reproduced.

## Root cause found (PM, 2026-10-07)

The owner's report reproduced from a phone. There were two causes.

1. **The sign-in code never reached Grid.** The callback page handed the code to the window that
   opened the sign-in, through `window.opener`. Most sign-in pages cut that link, and on phones the
   sign-in opens in a separate browser tab (Chrome Custom Tab, Safari) with no opener at all. The
   page said "Signed in. Go back to Grid to finish connecting", and nothing was ever exchanged.
   Fix: the callback page now finishes the sign-in itself, with an unauthenticated
   `POST /connectors/sign-in/callback`, proved by the sign-in's single-use random state. The
   dialog collects the result from `GET /connectors/sign-in/outcome`: on a timer, at once when the
   window says it is done, and when the page becomes visible again.
2. **Some services refuse the phone's address to come back to.** Measured against the real
   servers with a Tailscale https callback: Linear, Sentry, Stripe, PostHog, Supabase, Cloudflare,
   Notion and Neon accept it and load their sign-in pages. Vercel and Intercom accept only loopback
   addresses, so Grid now says to connect them once from the computer Grid runs on (or use a key).
   Figma (403 for every address, approved apps only) and Slack (no self-registration) cannot sign
   in for any third-party app, so they are removed from the catalog.

Validation: runner 481 / 481 (6 new sign-in tests: callback without a session, single use,
workspace isolation, declined sign-in, loopback-only and approved-only servers). Console 123 files /
699 tests (3 new callback page tests). Lint, typecheck and architecture checks pass. End to end on
an isolated runner (:4199) and console (:3023): a real Linear sign-in was started from the dialog,
and the callback page was opened as Linear would open it, with the real state and a fake code.
The runner took the code to Linear's real token endpoint, which rejected it ("Invalid
authorization code format"), and that result reached both the callback page and the waiting
dialog. A real sign-in by the owner is the remaining check.

## Follow-up: "expired" after giving access (PM, 2026-10-07)

The owner tried Neon three times from the phone. Each sign-in succeeded at Neon, then showed "That
sign-in has expired". On Android the callback address sits inside the installed app's scope, so it
can open in the app's own window (leaving the dialog) as well as in the browser tab. A second visit
found the state already spent, and the window the dialog lived in was gone.

Fixed:
- Finishing is idempotent. A repeated callback for a finished sign-in answers with the same
  success, and one arriving while the first is exchanging waits for it (the code is exchanged once).
- Outcomes are read, not taken, so every window waiting on a sign-in hears the same result.
- The callback page offers "Continue in Grid". It goes to `/settings/connectors?resume=…&service=…`,
  and the connectors screen reopens that service's dialog and picks the finished sign-in up at
  Tools.

Validation: runner 482 / 482 (a new test opens the page twice at once and checks one exchange).
Console 700 / 700 (Continue link, and the screen resuming at Tools). In the browser, on an isolated
runner and console: a real Linear sign-in was started, the tab went to the resume link without a
workspace (redirected with the query kept), the dialog reopened waiting, and the callback finished
from another tab. Linear's real token response reached the reopened dialog.

## Follow-up: Neon "authorization request expired or is invalid" (PM, 2026-10-07)

Neon's own page (`mcp.neon.tech/api/authorize`) refused the owner's approval. Measured: Neon shows
its consent page and keeps the request in a cookie (`neon_mcp_at_…`, 30 minutes). Posting the
approval without that cookie returns exactly the owner's error; with it, the request passes that
check. So the approval went out from a different browser session than the page load. The dialog
opened sign-ins as a blank named popup pointed at the service afterwards, and in an installed
Android app that blank window and the tab showing the service can be separate sessions. The named
window could also be reused from an earlier attempt.

Fixed: on touch screens and in the installed app, the dialog prepares the sign-in and shows
"Continue to <service>", a real link opened by the person's tap (one tab, one session). Desktop
keeps the popup, now a fresh window each time. A failed sign-in resets to a fresh one. Tests: phone
link with no popup, desktop popup that is never a named window. Browser check at 375px:
"Continue to Neon" points at `mcp.neon.tech/api/authorize`. Console 124 files / 702 tests pass, and
lint, typecheck and architecture checks pass.
