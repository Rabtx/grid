---
id: str-environment-projects
title: A project runs on the machine its folder is on, chats, agents and files included
type: feature
from: human
to: web
priority: high
status: done
assignee: claude
reviewer: human
parent: .agents/plans/portable-next.md
depends_on: [str-codespaces-environments]
branch: agent/web/environment-projects
worktree: ../grid-worktrees/agent/web/environment-projects
scope:
  - apps/console/src/modules/environments/**
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/projects/**
  - apps/console/src/modules/terminal/components/terminal-screen.tsx
  - apps/console/src/modules/settings/components/agents-screen.tsx
allowed_shared:
  - apps/runner/src/environments/**
created: 2026-09-25
updated: 2026-09-25
---

## What

After pairing, only terminals could run on a Codespace. Chats, agents, the Files screen and
the folder picker still used this machine.

## Why / Context

The person asked for chats and project files inside the Codespace, and for it to feel
seamless.

## Proposal or Ask

The folder decides: choosing a project's folder on an environment runs the project there. No
separate setting; every call about the project follows its folder.

## Scope

**In scope:**
- which environment each project runs on (home runner);
- the machine picker in Add project, Choose folder and Settings → Agents;
- scoping chats, agents, files, folders and terminals by project.

**Out of scope:**
- push notifications for turns that finish on an environment;
- GitHub sign-in for Codespaces (next card).

## Validation

- Runner `bun test src/environments`: 11 passed, including placements (per person, only one's
  own environments, cleared when an environment is removed) and a relayed
  `/projects/folders` call.
- Console `bun x vitest run`: 202 passed.
- `bun x tsc --noEmit`, oxlint and `bun run architecture:check`: pass.

## Resolution

**Home runner** (`environments/registry.ts`, `routes.ts`):
- New table `project_environments`.
- `GET /environments/placements` and `PUT /environments/placements/:slug`.
- An environment can only be chosen by its owner; removing it moves its projects back here.

**Console:**
- `placementsStore` and `scopeFor` (`/env/<id>`) are the single switch, and `MachinePicker`
  shows only once an environment exists.
- Chats:
  - Threads, new chats and the live socket use the project's machine.
  - The agent list is per machine.
  - "Running" indicators poll every machine a project runs on.
- Files, the folder browser and folder links are scoped to the machine.
- The workspace merges each project's folder from its own machine.
- A new terminal opens where the current project runs, in its folder.
- Settings → Agents can show and configure an environment's agents.
