---
id: str-codespaces-environments
title: Pair a Codespace (or any Grid) as an environment over the tailnet and run terminals there
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: .agents/plans/portable-next.md
depends_on: []
branch: agent/backend/environments-link
worktree: ../grid-worktrees/agent/backend/environments-link
scope:
  - apps/runner/src/environments/**
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
  - apps/runner/src/config.ts
  - apps/runner/src/pair.ts
  - apps/runner/package.json
  - apps/launcher/**
allowed_shared:
  - package.json
  - .devcontainer/**
  - apps/docs/content/docs/portable.mdx
  - .agents/plans/portable-next.md
  - apps/console/src/modules/environments/**
  - apps/console/src/modules/terminal/**
  - apps/console/src/modules/settings/components/settings-nav.tsx
  - apps/console/src/app.tsx
created: 2026-09-25
updated: 2026-09-25
---

## What

Connect a Codespace to the home Grid securely, and open terminals on it from the home console.

## Why / Context

Phase 4 of `.agents/plans/portable-next.md`, "Grids as environments". The person chose
"both, tailnet first": the Tailscale route now, GitHub sign-in and private ports later.

## Proposal or Ask

- The environment joins the tailnet, and its runner listens on its tailnet address only.
- A one-time code is traded for a pairing secret.
- The home runner relays the console's calls, presenting the pairing token instead of the
  person's session.

## Scope

**In scope:** runner pairing and relay, launcher tailnet detection and `grid:pair`, dev container
Tailscale feature, Settings → Environments, terminals on an environment.

**Out of scope, next:** agent chats and folders on an environment; GitHub Codespaces
management.

## Validation

- Runner, `bun test`: 75 passed. Two real runners on loopback cover:
  - pairing, wrong codes, expiry and voiding after ten guesses;
  - owner isolation;
  - a real shell through the relayed socket;
  - revoking on removal;
  - no access without a pairing.
- Launcher, `bun test`: 4 passed. Console, `bun x vitest run`: 202 passed.
- `bun run typecheck`, `bun run lint`, `bun run architecture:check`: pass.
- Live on the tailnet: a pairing runner bound to 100.108.118.107:4199 gave these results.
  - It answered at the MagicDNS name and refused loopback.
  - It rejected a wrong code with 403.
  - It returned 401 for `/terminals` without a pairing.
  - `bun src/pair.ts` issued a code.
- Not yet run: pairing from a real Codespace (it needs a Tailscale auth key the person creates).

## Resolution

**Runner, `apps/runner/src/environments/`:**

- `pairing.ts`: the environment side. It issues a one-time code (10 minutes, rejection-sampled,
  voided after 10 wrong guesses). Pairing stores only the SHA-256 of a 256-bit secret, bound
  to one person's id. The token format is `grid-env.<peer>.<secret>`.
- `registry.ts`: the home side. Addresses must be on the tailnet (`.ts.net`, 100.64/10), or be
  https hosts allowed in `RUNNER_ENVIRONMENT_HOSTS`.
- `relay.ts`: carries HTTP and WebSocket traffic under `/env/<id>/…`. It forwards
  terminals, chat, fs, projects and transcribe only. Frames that arrive while the hello is
  checked are buffered.
- `routes.ts`: the pairing and environment routes.

**Launcher:**

- `GRID_PAIRING` defaults to on when `TS_AUTH_KEY` is set.
- When pairing, the runner binds the tailnet IP.
- `bun run grid:pair` prints the address and a code.

**Dev container:** Tailscale feature, tun device and capabilities.

**Console:**

- Settings → Environments: pair, see whether each environment is reachable, remove.
- The terminal's "+" offers "This machine" or an environment, and each tab is labelled with
  its environment.

**Docs:** `/docs/portable` and `.devcontainer/README.md`.
