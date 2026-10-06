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

- **API-key catalog connector:** connected to a bearer-protected mock Slack MCP server, listed `list_channels`, persisted, rechecked healthy after reopening the connector service on the same database, and disconnected. The connection view did not return the token.
- **OAuth connector:** exercised the Linear sign-in path with an injected local OAuth provider: dynamic client registration, PKCE authorization URL, callback code exchange, tool listing, persistence/recheck, and disconnect all succeeded. The access token was absent from the connection view. This validates the local OAuth flow but does not validate an interactive browser sign-in against a real provider.
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
