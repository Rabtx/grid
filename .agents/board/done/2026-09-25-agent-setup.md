---
id: str-agent-setup
title: Install and sign in coding agents on any machine from Grid
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: [str-github-codespaces]
branch: agent/backend/agent-setup
worktree: ../grid-worktrees/agent/backend/agent-setup
scope:
  - apps/runner/src/agents/setup.ts
  - apps/runner/src/agents/setup.test.ts
  - apps/runner/src/agents/registry.ts
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/terminals.ts
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
allowed_shared:
  - apps/console/src/modules/settings/components/agents-screen.tsx
  - apps/console/src/modules/chat/**
created: 2026-09-25
updated: 2026-09-25
---

## What

A new machine (a Codespace, a VPS) has no coding agents. Installing one and signing in to
your own account meant opening a shell there and knowing each vendor's commands.

## Why / Context

The person asked for agents to be installed and set up on a Codespace from Grid, cleanly,
including the sign-in to their own agent account.

## Proposal or Ask

Settings → Agents, on any machine (the machine picker from #74), offers **Install** for a
missing agent and **Sign in** for an installed one, and shows whether each is signed in.
Both run the vendor's own command in a terminal on that machine:
- every sign-in style works as intended: a browser link, a device code, or a code to paste
  back;
- the person sees exactly what runs.

## Scope

**In scope:**
- the runner's setup definitions, the sign-in status, and terminals opened with a command;
- PATH covering the installers' folders;
- the Agents screen.

**Out of scope:** Antigravity has no documented installer, so Grid links to its site.

## Validation

- Runner, `bun test`: 85 passed. New tests cover the commands, the PATH merge, and a
  terminal typing its command.
- Console, `bun x vitest run`: 202 passed. `tsc` and oxlint: clean.
- Live on this machine:
  - The sign-in checks read Claude Code, Codex and opencode as signed in, in 0.3 s, under
    0.1 s and 1.4 s.
  - The provider listing carries `setup` for every agent.
  - `POST /chat/providers/opencode/setup {step:"sign-in"}` opened a terminal titled "Sign in
    opencode", typed `opencode auth login` and showed opencode's prompt.
  - Antigravity install returned 404.
- Found and fixed: `Bun.which` keeps the PATH the process started with. It now gets
  `process.env.PATH` explicitly, so an agent installed from Grid is found at once.

## Resolution

**Commands** (`agents/setup.ts`):

| Agent | Install | Sign in | Status check |
| --- | --- | --- | --- |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude auth login` (paste-back code) | `claude auth status --json` |
| Codex | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` | `codex login --device-auth` | `codex login status` |
| opencode | `curl -fsSL https://opencode.ai/install \| bash` | `opencode auth login` (optional: free models work without it) | `opencode auth list` |

**Runner:**
- `withAgentBins` adds `~/.local/bin`, `~/.opencode/bin`, `~/.bun/bin` and
  `~/.npm-global/bin` to PATH at start-up, for detection and for terminals.
- `TerminalStore.open` takes a first command and a title.
- `POST /chat/providers/:id/setup` only ever runs that agent's fixed command. It works on an
  environment through the existing `/env/<id>` relay.

**Console:** each agent card has a setup row with its status, **Install** or **Sign in**
(which opens the terminal), or **How to install**. The screen re-reads on every visit.
