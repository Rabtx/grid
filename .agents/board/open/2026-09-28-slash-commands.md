---
id: str-slash-commands
title: Slash commands in the composer
type: feature
from: human
to: web
priority: normal
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: agent/web/slash-commands
worktree: ../grid-worktrees/agent/web/slash-commands
scope:
  - apps/console/src/modules/chat/components/slash-menu.tsx
  - apps/console/src/modules/chat/lib/slash-commands.ts
  - apps/console/src/modules/chat/components/composer.tsx
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/chat/components/chat-screen.tsx
  - apps/console/src/kit/**
created: 2026-09-28
updated: 2026-09-28
---

## What

Roadmap A3. Typing `/` at the start of the composer opens a searchable list of commands, like `@`
already does for files (`file-mention-popup.tsx`, `use-file-mentions.ts` are the pattern).

## Why / Context

Common actions (a new thread, switching model or effort, stopping, turning a message into a board
task) are several clicks today. Another agent is adding attachments to the same composer, so keep
this change small in `composer.tsx`: the list and the commands live in their own files.

## Proposal or Ask

- **Grid commands:** `/new` (new thread in this project), `/model` (open the model picker),
  `/effort low|medium|high|…` (set effort), `/mode` (open the mode picker), `/stop` (stop the
  turn), `/task <text>` (create a board task from the text in this project), `/note <text>`
  (add a note), `/clear` (clear the composer). Each with a one-line description and its argument
  hint.
- **The agent's own commands** when it reports them (Claude's slash commands; ACP
  `available_commands`) listed after Grid's under the agent's name, sent to the agent as typed.
- **Behaviour:** filters as you type, arrows/Enter/Tab on desktop, a sheet on phones; Escape
  closes; a command needing an argument puts the cursor after it.
- Pure logic (parsing, matching, which commands apply) in `lib/slash-commands.ts`, tested alone.

Definition of done: `/` lists the commands, each Grid command works in a new chat and in a
thread, and an agent's own command reaches the agent.

## Scope

**In scope:** the listed chat files, kit pieces if needed.

**Out of scope:** the runner (only if an agent's commands are not already in its events: then
report that on the card instead of adding runner code); attachments.

## Validation

- Console tests: parsing and matching, the menu (keys, filter, choose), each command's effect.
- `bun run lint`, `bun run typecheck`, kit guard; a phone-width screenshot.

## Resolution
