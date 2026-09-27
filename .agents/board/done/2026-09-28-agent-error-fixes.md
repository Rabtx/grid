---
id: str-agent-error-fixes
title: Agents fail clearly and recover — effort defaults, retired models, busy models
type: bug
from: human
to: backend
priority: high
status: done
assignee: backend
reviewer: human
parent: none
depends_on: []
branch: agent/backend/agent-error-fixes
worktree: ../grid-worktrees/agent/backend/agent-error-fixes
pull_request: https://github.com/shabirkhan-dev/grid/pull/132
scope:
  - apps/runner/src/agents/antigravity.ts
  - apps/runner/src/agents/opencode.ts
  - apps/runner/src/agents/catalog.ts
  - apps/runner/src/agents/*.test.ts
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/hub.test.ts
  - apps/runner/src/chat/store.ts
  - apps/runner/src/chat/errors.ts
  - apps/runner/src/chat/errors.test.ts
  - apps/console/src/modules/chat/components/transcript-view.tsx
  - apps/console/src/modules/chat/components/transcript-view.test.tsx
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

Run in this worktree, all clean:

- `bun test` in `apps/runner` — `171 pass, 0 fail (23 files)`; new tests: `resolveEffort`/
  `agyModelId` never sends an empty effort and settle from `agy models` at session start
  (`catalogs.test.ts`), the hub's three outcomes with fake agents — busy keeps the model and the
  agent's text, model-gone refreshes the catalog and clears the chat's model, anything else is
  untouched (`hub.test.ts`), and the classifier against the real strings including Antigravity's
  `requires --effort` (`errors.test.ts`).
- `bun run --filter console test` — `52 files, 310 pass`; the error notice only offers "Try again"
  for a turn that failed on its own, resends the same message, and waits while the agent runs
  (`transcript-view.test.tsx`), plus the `retry` flag on end-turn errors only (`transcript.test.ts`).
- `bun run lint` → 0, `bun run format` → clean, `bun run typecheck` → 0 (all workspaces),
  `bun run architecture:check` → passed, `bun run naming:check` → OK (658 paths).
- Kit guard inside the console suite (no inline styles, kit components only).

## Resolution

- **Empty effort:** `resolveEffort` (`catalog.ts`) picks the chosen level when the model still has
  it, else its `defaultEffort`, else its middle level, and none for a model without levels;
  `agyModelId` takes the model's entry, and `startAgySession` settles it once against the agent's
  own list (`loadModels`, injected in tests so no real `agy` runs) at start and on `setModel`.
- **Retired/unknown model:** `errors.ts` classifies the agent's text; on `model-gone` the hub
  re-asks the agent for its models (`providerInfo(id, true)`), drops the model from the kept
  catalog (`ChatStore.dropCatalogModel`) and the chat (`model: null`), and closes the running
  agent so the next message starts without it.
- **Busy model:** on `provider-busy` the turn ends with one plain line — whose side it is on, and
  to try again — over the agent's own text, unchanged.
- **Console:** the turn-failed notice carries `retry: true`; `transcript-view.tsx` shows a small
  "Try again" (kit `Button`, disabled while running) that calls `onRegenerate` with the same
  message — the existing regenerate path, so `conversation.tsx` needed no change.
- **opencode's retired model** is handled by that same classification rather than by a change in
  `opencode.ts` (in scope, untouched): its failure text is what the hub reads, and the catalog
  refresh, the drop and the plainer wording are provider-agnostic.

## Completion evidence

Changed:

- `apps/runner/src/agents/catalog.ts` — `resolveEffort`.
- `apps/runner/src/agents/antigravity.ts` — `agyModelId(model, effort, modelChoice?)`,
  `settleEffort()` at session start and on `setModel`, `loadModels` option on the provider.
- `apps/runner/src/chat/errors.ts` (new) — `turnErrorKind`, `turnErrorMessage`.
- `apps/runner/src/chat/hub.ts` — `explainFailure` on every failed turn.
- `apps/runner/src/chat/store.ts` — `dropCatalogModel`.
- `apps/runner/src/agents/catalogs.test.ts`, `apps/runner/src/chat/hub.test.ts`,
  `apps/runner/src/chat/errors.test.ts` (new).
- `apps/console/src/modules/chat/lib/transcript.ts` — `retry` on the end-of-turn error notice.
- `apps/console/src/modules/chat/components/transcript-view.tsx` — the "Try again" action.
- `apps/console/src/modules/chat/lib/transcript.test.ts`,
  `apps/console/src/modules/chat/components/transcript-view.test.tsx`.

Validation:

- `bun test` (apps/runner): 171 pass, 0 fail, 23 files.
- `bun run --filter console test`: 52 files, 310 pass.
- `bun run lint`: 0 · `bun run format`: clean · `bun run typecheck`: 0 (all workspaces).
- `bun run architecture:check`: passed · `bun run naming:check`: OK (658 paths).

Contract impact:

- none — no API or schema change. Two additive surfaces: `turn_end.error` now begins with one
  plain line when the failure is recognisable (the agent's own text still follows, unchanged),
  and the console's notice block gained an optional `retry` flag.

Review:

- reviewer: human — PR [#132](https://github.com/shabirkhan-dev/grid/pull/132) open; review and
  merge pending, not merged by the implementation agent.

Commit:

- `6a5f098` `fix(runner,console): send a valid effort and make agent failures recoverable`
- the claim and this resolution are separate board commits.
