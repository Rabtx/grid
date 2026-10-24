---
id: grid-workbench-phase-three
title: thread browser for agents, chat tabs, keybindings, provider accounts and usage, clearer transcript
type: feature
from: human
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: grid-crews-handoff-side-chats
depends_on: []
branch: ccr-9c1ba5cb-8vmqkv
worktree: none
scope: [apps/runner/src/**, apps/console/src/**, apps/docs/content/docs/backend-api.mdx, CHANGELOG.md]
allowed_shared: []
created: 2026-10-24
updated: 2026-10-24
---

## What

Phase three of the Synara comparison, the owner's picks 6, 12, 13, 14 and 16: a clearer
transcript, chat tabs, several provider accounts with usage rings, remappable keybindings, and a
browser per thread that agents drive.

## Why / Context

These make a thread a workbench: the agent can check what it builds in a real page the person
watches, the person moves between threads and commands from the keyboard, sees how much of each
plan is left, and reads a turn at a glance.

## Proposal or Ask

Done when each works end to end in the console against a live runner, with runner and console
tests, and the API contract documents the new routes, events and tools.

## Scope

**In scope:** the paths above. The browser speaks the DevTools protocol to a local Chromium
directly (no new dependency). Usage is read from what agents report, not from vendors' usage
endpoints with their tokens.

## Evidence

- `bun test` in apps/runner: 543 pass (browser tools against a real Chromium, accounts,
  rate limits, the `/chat/tools` routing fix with a test that fails without it).
- `vitest run` in apps/console: 761 pass across 139 files; typecheck and lint clean.
- Live check on a local API, runner and console: a real Claude Code thread opened a page with
  `browser_open`, typed, clicked and took a screenshot while the Browser pane showed it; tab menu,
  pin, Alt+W / Alt+Shift+T / Alt+3, the keybinding recorder, adding an account (its sign-in
  terminal opened) and the phone tab switcher were exercised in Chromium at desktop and phone
  widths.
