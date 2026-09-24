---
id: str-chat-transcript-match
title: Chat transcript matches the design reference — user bubble, folded tool calls, code blocks
type: feature
from: human
to: ui-ux
priority: high
status: open
assignee: none
reviewer: claude
parent: none
depends_on: [str-console-shell-match]
branch: agent/ui-ux/chat-transcript-match
worktree: ../grid-worktrees/agent/ui-ux/chat-transcript-match
scope:
  - apps/console/src/modules/chat/components/transcript-view.tsx
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/chat/lib/transcript.ts
  - apps/console/src/modules/chat/lib/transcript.test.ts
  - apps/console/src/modules/chat/lib/markdown.ts
  - apps/console/src/modules/chat/lib/markdown.test.ts
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Restyle the chat transcript to match the design reference screenshots in
`~/.local/share/grid/design-ref/` (`desktop-session.png`, `desktop-session-2.png`,
`desktop-session-3.png`, `desktop-tool-expanded.png`, `phone-session.png`). Look at them first.
Event handling and data stay as they are.

## Why / Context

The console shell is being rebuilt to the same reference (card str-console-shell-match, in
progress). Do **not** edit `chat-screen.tsx` or `composer.tsx`/`pickers.tsx` (another card).

## Proposal (measured from the reference)

- Column: `mx-auto max-w-4xl flex flex-col gap-1`, transcript base `text-[13px] leading-5`
  (map to `text-ui*` tokens; raw sizes are banned by `tokens.test.ts`).
- **User message:** full-width bubble `rounded-lg border border-ink/10 bg-ink/10 px-3 py-2
  text-sm`, clamped to 4 lines with expand; under it on hover: copy and edit/retry icon buttons
  (22px, ink/40) and the time (`text-xs` ink/40).
- **Tool calls fold into one summary line** per run of consecutive tool events: 28px row,
  `px-4 py-1`, 14px provider mark, text `text-sm ink/50` joining short verbs with " · "
  ("Read density.ts · Edited density.ts · Ran a command", "Searched the project"). Clicking
  expands a rail (`pl-5`, left guide line) listing each call: verb in ink/50 sans, target in
  ink/70 mono, status icon; running calls show a spinner; failed ones red. Permission requests
  stay prominent and are never folded.
- **Assistant text:** `px-4 text-sm leading-6`, markdown with `space-y-4`, bullets, bold; inline
  code as small mono chips (`rounded bg-ink/8 px-1 py-0.5 text-[12px]`); file paths in inline
  code get a small file-type mark.
- **Code blocks:** bordered card `rounded-lg border border-ink/10`, header row with language
  label and a copy button, line numbers in ink/35, horizontal scroll inside the card only.
- Phone: same structure, 16px gutters, no horizontal page scroll.

## Scope

**In scope:** the files above.

**Out of scope:** shell, composer, runner events.

## Validation

- `bun --cwd=apps/console run test` (add tests for the tool-call folding and summary text),
  `bun run typecheck`, `bun run lint`, `bun run format`.
- Playwright screenshots of a mocked conversation (user message, folded + expanded tool calls,
  markdown with code) at 1440×900 and 390×844, attached to the card.

## Resolution
