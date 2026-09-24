---
id: str-chat-pickers-antigravity
title: Chat — Antigravity agent, exact model names, effort levels, custom searchable pickers
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: claude
parent: .agents/plans/agent-chat.md (phase 2, part)
depends_on: [str-agent-chat-foundation]
branch: agent/ui-ux/chat-pickers
worktree: ../grid-worktrees/agent/ui-ux/chat-pickers
scope:
  - apps/runner/src/agents/**
  - apps/runner/src/chat/**
  - apps/console/src/modules/chat/**
  - apps/console/src/ui/popover.tsx
  - apps/console/src/ui/index.ts
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

The human's feedback on chat: Antigravity (`agy`) did not work; the native select pickers
(no search on Android) should be custom pickers; models should show their exact names and
effort levels for every agent; the model list needs search.

## Resolution

### Runner

- **Antigravity** (`agents/antigravity.ts`): headless stream-json — one long-lived `agy` per
  chat, `{"event":"user","message":{"content"}}` per turn; `step_update` → streamed text and
  tool calls, `result` → end of turn + usage; resume via `--conversation`. Headless `agy` cannot
  ask for permission, so modes decide up front (Default / Accept edits / Plan / Full access =
  `--dangerously-skip-permissions`); refused tools are reported in the chat.
- **Real catalogs**, cached 10 min, asked of each agent (no prompt, nothing spent):
  - Claude Code `list_models` control request → "Opus 5.5 (1M context)", "Fable 5.1", "Sonnet 5",
    "Haiku 4.5", each with its resolved model id and effort levels (low…max); `--effort`.
  - opencode `opencode models --verbose` → 426 models, grouped by provider, free / context size,
    per-model effort levels (variants); over ACP the effort is its `effort` config option.
  - `agy models` → "Gemini 3.8 Flash" etc., one entry per model with its High/Medium/Low levels
    (the CLI id is `model-effort`).
- ACP adapter: model, mode and effort through `session/set_config_option` (opencode's mode is a
  config option, so switching it failed before). Store gains `effort` (migrated in place).

### Console

- `ui/popover.tsx`: a native-popover panel — bottom sheet on phones, anchored above its trigger
  from md.
- `ModelPicker`: agent chips (new chat), effort chips for the chosen model, search (every word
  must match name, id, provider or description), list grouped by provider with descriptions,
  keyboard navigation on desktop. `ModePicker`: modes with descriptions. No native selects left
  in the composer. The effort carries over to a new model that has the same level; the last
  agent / model / effort per agent is remembered for the next new chat.

### Validation output

```text
$ bun test                # apps/runner
 32 pass
 0 fail
$ bunx vitest run         # apps/console
      Tests  143 passed (143)
$ typecheck · oxlint · bun run lint · architecture:check → clean;  console build ✓
```

Real agents (runner hub, no UI): catalogs for Claude Code (5 models, 4 with efforts), opencode
(426), Antigravity (7 models, 5 with efforts); a real Antigravity turn:
`user turn_start info msg("hello from grid\n") usage turn_end`.

Browser (Chromium, phone 390×844 touch and desktop 1280×820, scripted runner):

```text
pill: Claude Code · Default · Opus 5.5 (1M context) · High | native selects: 0
search 'gemini flash' -> 1 result (of 400)
pill after Claude + Max + Sonnet: Claude Code · Sonnet 5 · Max
created: {"provider":"claude","model":"sonnet","effort":"max","mode":"acceptEdits"}
console errors: none
```
