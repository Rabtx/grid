---
id: str-figma-roles
title: Agent roles, end to end, as the Figma 11 Agent roles frames draw them
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-composer]
branch: agent/web/figma-roles
worktree: none
scope:
  - apps/runner/src/roles/**
  - apps/runner/src/chat/**
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
  - apps/console/src/kit/**
  - apps/console/src/modules/chat/**
created: 2026-10-02
updated: 2026-10-02
---

## What

Roles had no backend; the person chose to build them end to end. A role is a workspace's named
preset — glyph, name, what it does, agent, model, effort, mode — and a new thread can start as
one.

## Scope

**Out of scope (nothing backs them yet, so not drawn):** Account (Personal), Fast mode, Skills,
time and credit estimates, "Manage" (edit and delete live in the role dialog instead).

## Resolution

**Runner** — `roles` table (per workspace, at most 50, made in one transaction) and
`GET/POST /roles`, `PATCH/DELETE /roles/:id` with field checks and a size cap. `POST
/chat/sessions` takes `role`: the session keeps a snapshot of it, and the agent is given the
role's brief with the first message that gets through (a command waits; a failed turn retries
it); the transcript keeps what was typed.

**Console** — new-thread composer: a role chip group (the role, and its settings) in place of
the model picker while a role is chosen. Role menu "Your team" (agent · model · effort per role,
roles whose agent is not on the machine shown but disabled, No role, New role, Edit). Role
settings: agent, model, effort for this thread, "Use once" or "Save to role" (only what
changed). Role dialog to make, edit and delete a role. The last role is remembered; a removed
role is dropped with the team read again. The thread header names the role.

**Validation** — console typecheck clean, lint 0 errors, 76 files / 495 tests (roles menu,
dialog, describeRole); runner tsc clean, roles routes and the brief's delivery tested (64 in
roles and chat; the link, environment and one flaky automation test fail on the base too);
build OK. Chromium at 1440×900 and 390×844, light and dark: menu, settings, dialog; a thread
started as Code reviewer kept the role, and the live agent acted on its brief.

**Review** — independent reviewer: 8 findings and lows, all fixed — brief lost after a failed
first turn, a command first breaking, a role with an unavailable agent applied wrongly, "agent
default" resolving to the last-used model, edits pinning or wiping model and effort, the team
never refreshed, the menu's keyboard roles, `/model` with a role, mode not saved, no size cap,
a race on the cap, and a role's picks overwriting your own remembered ones.
