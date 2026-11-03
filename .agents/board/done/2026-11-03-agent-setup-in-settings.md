---
id: str-agent-setup-in-settings
title: Install, sign in, update and account info for every agent in Settings → Agents
type: feature
from: human
to: backend
priority: normal
status: done
assignee: backend
reviewer: none
parent: 2026-11-03-native-opencode-provider.md
depends_on: []
branch: ccr-78b19f86-o8youq
worktree: /home/user/grid (cloud session; the session's designated branch)
scope: [apps/runner/src/agents/**, apps/runner/src/chat/hub.ts, apps/runner/src/server.ts, apps/runner/src/main.ts, apps/console/src/modules/settings/components/agents-screen.tsx, apps/console/src/modules/chat/types/chat.types.ts, apps/console/src/modules/chat/services/chat.service.ts, apps/docs/content/docs/portable.mdx]
allowed_shared: [apps/console/** (small UI addition approved by the human)]
created: 2026-11-03
updated: 2026-11-03
---

## What

Settings → Agents installs, signs in and updates Cursor and Antigravity like the other agents, and
shows who each agent is signed in as. Gemini CLI is dropped as a built-in (Antigravity covers it).

## Why / Context

The human uses Antigravity for Google's models and wants every CLI managed from one page.

## Proposal or Ask

- `AGENT_SETUP`: `update` command and `status()` (signed in + account) per agent; Cursor
  (`cursor-agent`, documented install/login/update/status) and Antigravity (install script, `agy`
  signs in on first start, `agy update`, `agy models` as the signed-in check).
- `POST /chat/providers/:id/setup` takes `step: "update"`; listing carries `canUpdate`, `account`.
- Console: Version row with Update; the sign-in row says who is signed in; the list shows it.

## Scope

**In scope:** paths above. **Out of scope:** sign-out buttons; Antigravity's API-key sign-in.

## Validation

- `bun test` (apps/runner), console vitest for settings and chat, both typechecks, pre-commit.

## Resolution

Done on `ccr-78b19f86-o8youq`. Status readers are unit-tested from documented output; Cursor's and
Antigravity's real `status`/`models` output was not checked live (installing them from this
session was blocked), so the readers accept JSON and text and fall back to "unknown".
