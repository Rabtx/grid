---
id: grid-connectors-repair
title: make connectors and mcp servers actually connect, by api key and by sign-in
type: bug
from: human
to: backend
priority: high
status: open
assignee: none
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

