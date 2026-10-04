---
id: str-figma-connectors
title: Settings match the Figma 24 Connectors frames — catalog, a connector, connecting, custom MCP
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-settings-roles]
branch: agent/web/figma-connectors
worktree: none
scope:
  - apps/runner/src/connectors/**
  - apps/runner/src/agents/provider.ts
  - apps/runner/src/agents/acp.ts
  - apps/runner/src/agents/claude.ts
  - apps/runner/src/agents/codex.ts
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/chat.test.ts
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
  - apps/console/src/modules/connectors/**
  - apps/console/src/modules/github/**
  - apps/console/src/modules/settings/components/settings-page.tsx
  - apps/console/src/kit/connector.tsx
  - apps/console/src/kit/settings.tsx
  - apps/console/src/kit/icons.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/lib/active-workspace.ts
  - apps/console/src/routes/app-shell.tsx
  - apps/console/src/app.tsx
  - packages/db/src/workspaces.ts
created: 2026-10-04
updated: 2026-10-04
---

## What

Figma "24 · Settings → Connectors" (catalog, Connector · GitHub, Connect, Custom MCP), desktop and
phone, made real: the tools a workspace uses, plugged in through their official MCP servers, and
handed to agents under the workspace's rules.

## Scope

Catalog: GitHub, Linear, Vercel, Sentry, Stripe, PostHog, Supabase, Cloudflare, Slack, Intercom,
Figma, Notion, Neon — every one a remote MCP server; discovery checked live against all 13.
**Agents that take connectors:** ACP agents (opencode, added ones), Claude Code (`--mcp-config`),
Codex (config overrides). Antigravity and Freebuff run as terminal apps and say "Can't use
connectors yet". **Left for later:** the Figma connect flow's step 2 picks projects inside the
service (Sentry projects); here step 2 shows the tools the server offers, since what "projects"
means differs per service. Custom servers run on this machine only for now.

## Resolution

**Runner** (`connectors/`):

- `catalog.ts` — each service's URL, sign-in ways, capabilities with their tools and defaults, and
  the files and packages that suggest it.
- `oauth.ts` — MCP sign-in per the spec: protected-resource metadata (RFC 9728), server metadata
  (RFC 8414), dynamic client registration (RFC 7591), PKCE, refresh.
- `vault.ts` — secrets AES-GCM encrypted under a key file only this user reads.
- `store.ts` — connections and their activity.
- `mcp-client.ts` — streamable HTTP and stdio; `probe` says hello and lists tools.
- `rules.ts` — a tool's rule from its capability, narrowed by agent (rules, read only, no access),
  shared repositories and the default branch.
- `proxy.ts` — what each agent runs per connector: never-tools are not listed and are refused,
  "Ask me" puts a question in the thread (`ChatHub.ask`), every call goes to the activity. It holds
  no secrets: the runner hands it config and fresh tokens against a per-start key.
- `service.ts`/`routes.ts` — the API.

GitHub signs in through this machine's GitHub CLI (or a token); others through OAuth or an API key.
Custom servers: a command (secrets from the vault, `$VARS` filled in) or a URL with a key, tried
before they are added. Changing anything takes "Manage integrations" (Settings → Roles).

**Console** — the catalog page (search, Dev/Ship/Business, connected cards with health and what
agents may do, five suggestions from the projects' stack, the workspace's own servers with an
on/off switch); the connect dialog (sign in in the service's own window, an API key or the GitHub
CLI → the tools found → agent access); Add an MCP server (command or URL, secrets, test, add); a
connector's page (Test, Disconnect, Powers, What agents can do, Per agent, Repositories for GitHub,
Recent activity). Phones: Figma's rows and sheets.

## Validation

- `bun run lint` 0, typecheck per package 0, `bun run architecture:check` OK, `vite build` OK.
- Console vitest 566 (new: summary and health ×2, catalog page ×2).
- Runner 391 (new: rules ×3, vault, client against a real stdio server, OAuth discovery →
  registration → PKCE → refresh, service add/check/agents, the proxy end to end — listing,
  refusing, asking, recording — `$VARS`, Claude and Codex arguments, `ChatHub.ask`).
- Live: OAuth discovery against all 13 catalog servers; GitHub's MCP server with the GitHub CLI's
  token (46 tools). In Chromium on this branch: connected GitHub through the dialog, then an
  opencode thread called `github_get_me` through Grid's proxy and answered with the login; the call
  showed in Recent activity. Added a custom stdio server (4 tools found, added, listed with its
  switch). Phone catalog and GitHub page checked.
