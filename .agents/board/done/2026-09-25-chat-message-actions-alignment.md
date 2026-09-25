---
id: str-chat-message-actions-alignment
title: Right-aligned user chat bubbles and message action bars (copy, note, handover, regenerate)
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: antigravity
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: []
branch: agent/ui-ux/chat-message-actions-alignment
worktree: ../grid-worktrees/agent/ui-ux/chat-message-actions-alignment
scope:
  - apps/console/src/modules/chat/components/transcript-view.tsx
  - apps/console/src/modules/chat/components/transcript-view.test.tsx
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/ui/icons.tsx
  - apps/console/src/ui/menu.tsx
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Refine the chat transcript experience to feel like a modern, professional conversation surface:
1. **User messages**: Right-aligned (`flex-col items-end`) with bubble styling (`rounded-2xl rounded-br-sm bg-ink/8 border-ink/10 max-w-[85%] sm:max-w-[75%]`). Includes action bar with **Copy** and **Add as note** (static action displaying toast notice).
2. **Assistant responses**: Left-aligned prose with dedicated action bar below the response:
   - **Copy**: copies response markdown text with checkmark feedback.
   - **Handover**: transfers current session to another model/agent via model picker menu, switches active model via `chooseModel` and triggers feedback toast `"Session handed over to <Model>"`.
   - **Add as note**: static action with note icon & tooltip, shows toast.
   - **Regenerate**: re-prompts the conversation with the preceding user message (disabled while a turn is actively running).
3. Every action button includes accessible labels, tooltips, and touch-target sizing (mobile first).

## Why / Context

User messages were previously full-width rectangular boxes, making it hard to distinguish sender turns. Assistant responses lacked quick actions for copy, handover to other models, saving to notes, or regenerating responses.

## Proposal

1. **UserMessage**:
   - Align right with max width (`max-w-[85%] sm:max-w-[75%]`).
   - Clean bubble styling: `bg-ink/8 border-ink/10 rounded-2xl rounded-br-sm px-3.5 py-2.5 shadow-xs`.
   - Right-aligned action strip with **Copy** and **Add as note** (`NoteIcon`).
2. **Assistant Message Actions**:
   - Render action strip below each completed assistant block.
   - **Copy**: copies message text to clipboard with checkmark feedback.
   - **Handover**: menu listing available models (`HandoverIcon`); selecting a model switches session model via `chooseModel` and triggers feedback toast.
   - **Add as note**: static action with `NoteIcon` displaying toast.
   - **Regenerate**: button (`RestoreIcon`) re-submitting the last prompt.
3. **Icons & Components**:
   - Add `NoteIcon` and `HandoverIcon` to `apps/console/src/ui/icons.tsx`.
   - Update `Menu` in `apps/console/src/ui/menu.tsx` to support custom `triggerClass` and `disabled`.

## Validation

- `bun --cwd=apps/console run test`: 30 test files passed (189 tests), including `transcript-view.test.tsx`.
- `bun run typecheck`: clean across all workspaces (`console`, `web`, `nest-api`, `runner`, `@grid/ui`, `@grid/logger`).
- `bun run lint`: passed cleanly with oxlint and shellcheck.
- `bun run format`: formatted with oxfmt and shfmt.
- `bun run architecture:check && bun run naming:check`: all 571 paths passed architecture and naming rules.

## Resolution

Implemented right-aligned user message bubbles and assistant response action bars in the console transcript view. Added unit tests for all actions. Moved card to `done/`.
