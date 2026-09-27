---
id: str-agent-error-fixes
title: Agents fail clearly and recover — effort defaults, retired models, busy models
type: bug
from: human
to: backend
priority: high
status: open
assignee: none
reviewer: human
parent: none
depends_on: []
branch: agent/backend/agent-error-fixes
worktree: ../grid-worktrees/agent/backend/agent-error-fixes
scope:
  - apps/runner/src/agents/antigravity.ts
  - apps/runner/src/agents/opencode.ts
  - apps/runner/src/agents/catalog.ts
  - apps/runner/src/agents/*.test.ts
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/store.ts
  - apps/console/src/modules/chat/components/transcript-view.tsx
  - apps/console/src/modules/chat/lib/**
created: 2026-09-28
updated: 2026-09-28
---

## What

Three agent failures seen in real chats (`~/.local/share/grid/chat.db`, `turn_end` events with
`reason: "error"`), each fixed at the source and each shown to the person in a way they can act on.

## Why / Context

1. **Antigravity + Gemini 3.8 Flash:** `invalid model selection (--model "gemini-3.8-flash"
   --effort ""): --model gemini-3.8-flash requires --effort`. The chat has no effort chosen and the
   adapter sends an empty one (`agyModelId` in `apps/runner/src/agents/antigravity.ts`, and the
   args built in `agyArgs`). A model with effort levels must fall back to its `defaultEffort` (or
   the middle level), never "".
2. **opencode's retired free model:** `Internal error: Thank you for participating in the
   Stealth … testing period`. The model list is cached (`ChatStore.catalog`, `cached(...)` in
   `catalog.ts`), so a retired model stays offered and every message to it fails.
3. **A busy model:** Codex `Selected model is at capacity. Please try a different model.` —
   correct, but the chat just ends with a red line and no way forward.

## Proposal or Ask

- Antigravity: always send a valid effort for models that have levels (the chosen one, else the
  model's default, else the middle level); tests for `agyArgs`/`agyModelId` with no effort.
- Retired or unknown models: when an agent's error says the model is gone/unknown/not available,
  refresh that agent's catalog (as the "refresh models" action does), drop the model from the
  kept list, and end the turn with an error that says so ("This model is no longer offered by
  opencode; pick another").
- Busy models ("at capacity", rate limited, overloaded): end the turn with an error that says it
  is the provider's side and keep the message, so sending again (or with another model) is one
  step; if the transcript already has a retry pattern, use it; otherwise add a small "Try again"
  action to the error notice in `transcript-view.tsx` that resends the last message.
- Keep errors short and plain; never hide the provider's own text (show it as the detail).

Definition of done: the three messages above no longer happen or end with a clear, actionable
notice; covered by tests with fake agents.

## Scope

**In scope:** the listed runner agent files, the hub/store catalog handling, the transcript's
error notice.

**Out of scope:** attachments (another agent is on `claude.ts`/`acp.ts`/composer); the model
picker's layout.

## Validation

- `bun test` in `apps/runner` (new tests for each case), console tests for the notice.
- `bun run lint`, `bun run typecheck`, kit guard.

## Resolution
