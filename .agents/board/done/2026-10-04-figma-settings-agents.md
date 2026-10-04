---
id: str-figma-settings-agents
title: Settings match the Figma 24 agent frames — Agents & permissions and Machines
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-settings-workspace]
branch: agent/web/figma-settings-agents
worktree: none
scope:
  - packages/db/src/schema/workspaces.schema.ts
  - apps/api/src/modules/workspaces/**
  - apps/runner/src/agents/**
  - apps/runner/src/chat/**
  - apps/runner/src/machine/**
  - apps/runner/src/terminals.ts
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
  - apps/console/src/modules/settings/**
  - apps/console/src/modules/environments/**
  - apps/console/src/modules/workspaces/types/**
  - apps/console/src/modules/chat/types/**
  - apps/console/src/modules/shell/components/rail.tsx
  - apps/console/src/modules/auth/components/setup-form.tsx
  - apps/console/src/modules/github/components/connectors-screen.tsx
  - apps/console/src/kit/machine.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/app.tsx
created: 2026-10-04
updated: 2026-10-04
---

## What

The agent part of Figma "24 · Settings": Agents & permissions and Machines, on desktop and phones,
with the backend each needs. Roles and Connectors follow in their own cards.

## Scope

**Left for later:** "Only work inside ~/Projects" is shown on and fixed — the runner always keeps
agents inside its projects folder, so there is nothing to turn off yet.

## Resolution

**Runner** — workspace agent policy (read, edit, run commands, install packages, network, push:
allow / ask / never; work on a new branch; show every command). The runner answers an agent's
permission request by the policy and leaves "ask" to the person; with "new branch" on, pushes to
the default branch are refused and the first message says so. Agent versions (cached ten minutes),
custom ACP agents (`POST`/`DELETE /agents/acp`, admin). `GET`/`PATCH /machine`: host, system, CPU,
memory, disk, runner version, running agents and terminals; start at login (XDG autostart or a
LaunchAgent running `bun run grid`), keep awake while agents work (`systemd-inhibit` /
`caffeinate`), agents at the same time (1, 2 or 4, a turn limit in the hub).

**API** — workspace settings take `agentPolicy`; PATCH merges its rules.

**Console** — Agents & permissions: agents with logo, version or default model, Default and
Connected badges, a sheet per agent (offer in new threads, model and mode, sign in, refresh models,
make default, remove a custom agent), install buttons, Add ACP agent; "What agents can do on their
own" with Allow / Ask / Never; Safety switches. Machines (was Environments, old links redirect):
this machine as a card with live meters, other machines with Online / Offline and Remove, Add
machine, Codespaces, Runner switches, Worktrees and Diagnostics. Sidebar: members count, machine
status dot. Phones: Figma's rows, page menus for Add ACP agent and Add machine.

## Validation

- `bun run lint` 0, `bun run typecheck` 0, `bun run architecture:check` OK.
- Console vitest 551 tests (new: agents ×2, machines ×2).
- Runner 370 pass (new: policy answers, custom ACP agents, machine prefs and info, auto-answer and
  turn limit in the hub).
- API 128 pass (with the database).
- Chromium against this branch's API and runner: desktop and phone Agents & permissions and
  Machines with real machine data. Start at login was not toggled, to leave this machine's
  autostart alone.
