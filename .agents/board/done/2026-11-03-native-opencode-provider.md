---
id: str-native-opencode-provider
title: Run opencode 2 through its own service (native provider), Cursor and Gemini CLI built in
type: feature
from: human
to: backend
priority: high
status: done
assignee: backend
reviewer: none
parent: none
depends_on: []
branch: ccr-78b19f86-o8youq
worktree: /home/user/grid (cloud session; the session's designated branch replaces agent/<role>/<slug>)
scope: [apps/runner/src/agents/**, apps/runner/package.json, bun.lock]
allowed_shared: [bun.lock]
created: 2026-11-03
updated: 2026-11-03
---

## What

Drive opencode 2 the way its own clients do: through opencode's local background service
(`opencode serve --service`) and the official `@opencode/client` promise API, instead of a
`opencode acp` process per run. Add Cursor (`agent acp`) and Gemini CLI (`gemini --acp`)
as built-in agents.

## Why / Context

- opencode 2 dropped `opencode models --verbose`, which emptied Grid's model picker
  (fixed first on this branch: ACP probe, then plain list).
- One `opencode acp` process per run used ~500 MB on a 4 GB VPS, and a crashed process ends its run.
- t3code (`pingdotgg/t3code`, `packages/provider-opencode`) runs opencode 2 through its service and
  `@opencode/client` (`model.list`, `session.create/prompt/interrupt/switchModel/switchAgent/fork`,
  `permission.reply`, `session.form.reply`, `event.subscribe`). Grid already does the same for
  Codex (`codex app-server`).
- Cursor documents `agent acp` (cursor.com/docs/cli/acp); t3code's Cursor V2 uses `@cursor/sdk`,
  which needs a paid plan, so Grid uses Cursor's own ACP transport. t3code runs Gemini through its
  Antigravity provider (Grid has one) and Gemini CLI as a generic ACP agent.

## Proposal or Ask

- `opencode-service.ts`: provider over the service; one shared service, per-session environment
  (`session.environment`), native steer (`delivery: "steer"`), resume and fork, approvals
  (`permission.reply`), questions (`session.form.reply`), usage, models with names, context and
  effort variants (`model.list`), modes from primary agents (`agent.list`).
- Connectors (MCP) are added to the service per session (`mcp.add`, scoped by permissions).
- Falls back to the ACP provider for opencode 1, a sandboxed run, or
  when the service cannot be reached.
- Registry: `cursor` (`agent acp`) and `gemini` (`gemini --acp`) as ACP agents.

Definition of done: picker lists opencode 2 models with names, a chat runs through the service on
the Grid VPS, tests cover event mapping, fallback and model parsing; runner checks green.

## Scope

**In scope:**

- `apps/runner/src/agents/**`, `apps/runner/package.json`, `bun.lock`

**Out of scope:**

- Console UI changes; Cursor `@cursor/sdk` runtime (needs a paid plan).

## Validation

- `bun --cwd=apps/runner test`, `bun run --filter runner typecheck`, `bunx oxlint apps/runner`
- Live: a turn on the Grid VPS through the opencode service (text, tool call, approval).

## Resolution

Landed on `ccr-78b19f86-o8youq`, merged to `main` at the human's request:

- `fix(runner)` (2a8660b, b957501): opencode 2's model list (plain list, then ACP probe with names).
- `feat(runner)` (8a9ef8f): `apps/runner/src/agents/opencode-service.ts` drives opencode 2 through
  its background service with `@opencode/client` 2.2.5; ACP stays for opencode 1, sandboxes and an
  unreachable service. Cursor (`agent acp`) and Gemini CLI (`gemini --acp`, 0.66 flag) built in.
- Docs: `/docs/portable#the-agents-grid-drives`.

Validation: `bun test` in apps/runner (opencode-service 15 tests, catalogs), runner typecheck and
oxlint green via pre-commit. Live on the Grid VPS (opencode v2.2.5): catalog 40 models + build/plan
modes from the service; a turn returned `done` with text and usage; a bash tool call streamed
pending → running → completed; one shared `opencode serve --service` (~326 MB).

Not live-tested: Cursor and Gemini CLI (need the person's sign-in); approvals and forms are covered
by unit tests only.
