---
id: str-slash-commands
title: Slash commands in the composer
type: feature
from: human
to: web
priority: normal
status: doing
assignee: web
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
  - .agents/board/doing/2026-09-28-slash-commands.md
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

### Scope note (claimed by web)

Opening the model and mode pickers from `/model` and `/mode` needs a handle the pickers did not
expose. This card adds one optional prop (`control`) to `ModelPicker`/`ModePicker` in
`apps/console/src/modules/chat/components/pickers.tsx`, forwarding the kit `PopoverControl` the
same way every other console popover does. Approved by the human owner before coding.

## Validation

- Console tests: parsing and matching, the menu (keys, filter, choose), each command's effect.
- `bun run lint`, `bun run typecheck`, kit guard; a phone-width screenshot.

## Resolution

Done on `agent/web/slash-commands`. Typing `/` at the start of the composer opens the command
list; it filters as you type, and arrows/Enter/Tab pick while Escape closes.

**Changed**

- `apps/console/src/modules/chat/lib/slash-commands.ts` — the catalog, `availableCommands` (which
  commands apply), `findSlashQuery`, `filterCommands`, `parseSlashCommand`, `insertCommand`, and
  the `useSlashCommands` hook the composer drives.
- `apps/console/src/modules/chat/components/slash-menu.tsx` — the list, on the kit
  `AutocompleteList`.
- `apps/console/src/modules/chat/components/composer.tsx` — the overlay slot, the key/input hooks
  ordered alongside file mentions, and send-time interception (`commands` + `onCommand` props).
  Kept small: the list and the commands live in their own files.
- `apps/console/src/modules/chat/components/chat-screen.tsx` (`NewChat`) and
  `conversation.tsx` — which commands apply here and what each one does.
- `apps/console/src/kit/palette.tsx` — `AutocompleteItem.group`, so the list can head a run of
  commands (Grid, then the agent's name); the active-row scroll now matches by `data-index` so
  headings do not shift it.
- `apps/console/src/kit/select.tsx` and `apps/console/src/modules/chat/components/pickers.tsx` —
  an optional `control` (`PopoverControl`) to open the model and mode panels from code, the
  pattern every other console popover already uses (owner-approved scope note above).
- Tests: `lib/slash-commands.test.ts`, `components/slash-menu.test.tsx`, and the new slash cases
  in `components/composer.test.tsx`.

**Validation**

- `bun --cwd=apps/console run test`: 54 files, 336 tests passed (includes the kit guard).
- `bun --cwd=apps/console run typecheck`: passed.
- `bun --cwd=apps/console run build`: passed.
- `bun --cwd=apps/console run lint`: passed (one pre-existing warning in
  `modules/auth/components/login-form.tsx`, untouched by this change).
- `bun run architecture:check`: boundaries and kebab-case naming passed.
- `bunx oxfmt --check .`: clean.
- No phone-width screenshot: this environment has no browser automation, so the phone
  presentation was not visually captured. It reuses the `@` mention panel
  (`AutocompleteList`: full width above the field on phones, `md:w-96` on desktop), not the modal
  `Popover` bottom sheet — a modal sheet would take the keyboard away from the field that arrows
  and Enter need.

**Agent's own commands (runner)**

Not in the runner's events, as suspected: `apps/runner/src/agents/events.ts` `ChatEvent`'s `info`
carries `models`/`modes`/`efforts` only, and `apps/runner/src/agents/acp.ts` maps
`availableModels`/`availableModes` but never ACP `available_commands`. No runner code was written
per the card. The console side is ready for it: `availableCommands(context, extra)` takes the
agent's commands, the menu heads them with the agent's name, and `insertCommand`/`parseSlashCommand`
leave anything that is not a Grid command in the field to be sent to the agent as typed. A
follow-up runner card is needed to put `available_commands` into `info`.

**Contract impact:** none (console-only; no API or schema change).

**Review:** pending — `human`.

**Commit:** this card's commit on `agent/web/slash-commands`.
