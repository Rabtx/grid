---
id: str-chat-composer-match
title: Chat composer and pickers match the design reference
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: opencode
reviewer: claude
parent: none
depends_on: [str-console-shell-match]
branch: agent/ui-ux/chat-composer-match
worktree: ../grid-worktrees/agent/ui-ux/chat-composer-match
scope:
  - apps/console/src/modules/chat/components/composer.tsx
  - apps/console/src/modules/chat/components/pickers.tsx
  - apps/console/src/modules/chat/lib/choices.ts
  - apps/console/src/modules/chat/lib/choices.test.ts
  - apps/console/src/modules/chat/components/chat-screen.tsx (reviewer: placeholder only)
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Restyle the chat composer and its model / mode pickers to match the design reference screenshots
in `~/.local/share/grid/design-ref/` (`desktop-new-session.png`, `desktop-model-picker.png`,
`desktop-mode-picker.png`, `desktop-session-2.png`, `phone-new-session.png`). Look at them
before you start. Behaviour (providers, models, effort, modes, voice) stays as it is.

## Why / Context

The console shell is being rebuilt to the same reference (card str-console-shell-match, in
progress). Do **not** edit `chat-screen.tsx` or anything outside the scope; the composer's props
stay compatible so the shell work can drop it in.

## Proposal (measured from the reference)

Composer box: `rounded-lg border border-ink/10 bg-ink/3 backdrop-blur-sm`, focus
`border-ink/20`. Three rows:

1. **Context row** `flex items-center gap-2.5 px-3 pt-2.5`: 24px chips, `text-[12px]`-equivalent
   token (use the smallest `text-ui*` token that exists — raw sizes are banned by
   `tokens.test.ts`), ink/55, 14px icon, hover `bg-ink/8`. Show the project folder chip (it opens
   the folder chooser the composer already gets via props) and, when known, the git branch.
2. **Field:** textarea `px-3 py-3 text-sm leading-5.5`, max height 10rem, placeholder
   "Ask, build, / for commands, @ for references…".
3. **Toolbar** `flex items-center gap-1 px-2 pb-2`: 26px `+` button on `bg-selection`
   (attach, disabled for now with a title), then the **model chip** (26px, `bg-selection`,
   provider mark 16px, model name 11px, effort in ink/50 at 11px, chevron 12px) and the
   **mode chip** (lock icon, mode name, chevron). Mic and a 26px square send button
   (`primary-action`, rounded-md, arrow-up icon) on the right.

Model picker popover (248px, `p-1`): rows 36px `rounded-lg px-2 text-[13px]`: "Effort" with the
current value in ink/55 and a chevron opening a submenu; "Model" with provider mark + name and a
chevron opening the searchable model list (keep the existing search); provider switching lives in
the model list grouped by provider. Mode picker popover (286px, `p-1`): rows with a 14px icon,
13px medium title and an 11px ink/50 one-line description (write short descriptions for each mode
the providers expose; fall back to none). Selected row on `bg-selection`. On phones the pickers
are bottom sheets with 44px rows.

## Scope

**In scope:** the four files above.

**Out of scope:** chat-screen, transcript, runner.

## Validation

- `bun --cwd=apps/console run test`, `bun run typecheck`, `bun run lint`, `bun run format`.
- Playwright screenshots of the composer and both pickers at 1440×900 and 390×844 against the
  reference, attached to this card with the command output.

## Resolution

Implemented by opencode (mimo-v2.6-flash-free); reviewed, finished and verified by claude.

- `composer.tsx`: `rounded-lg border-ink/10 bg-ink/3` box; context row with the folder chip and an
  optional branch chip; field with the new default placeholder; toolbar with a 26px `+` (attach,
  disabled for now), the pickers, the mic, and a 26px send/stop button; 44px targets on touch.
- `pickers.tsx`: model chip (agent mark, model name, effort in ink/50) opening a 248px panel with
  Effort and Model rows that open the effort submenu and the searchable, provider-grouped model
  list; mode chip with a glyph opening a 286px list of modes with one-line descriptions; bottom
  sheets on phones.
- `choices.ts`: `findChoice`, `modeGlyph`, `modeDescription` (with tests).
- Reviewer fixes: phones show the mode chip as its icon only so the model name has room; tighter
  context chips on touch; chat-screen stops overriding the placeholder.

Validation: console 154 tests pass, typecheck and lint clean; Playwright at 1440×900 and 390×844
(composer, model panel, mode panel, phone sheet) with no console errors or strict warnings.
