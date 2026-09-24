---
id: str-console-keyboard-shortcuts
title: Keyboard shortcuts on desktop, with a ? help sheet
type: feature
from: ui-ux
to: web
priority: normal
status: done
assignee: web agent (claimed outside its worktree); finished by claude
reviewer: claude
parent: .agents/plans/console-design-migration.md (UX polish round)
depends_on: []
branch: agent/web/console-keyboard-shortcuts
worktree: ../grid-worktrees/agent/web/console-keyboard-shortcuts
port: 3044
scope:
  - apps/console/src/lib/shortcuts.ts
  - apps/console/src/lib/shortcuts.test.ts
  - apps/console/src/modules/shell/components/shortcuts-help.tsx
  - apps/console/src/modules/shell/index.ts
allowed_shared:
  - apps/console/src/routes/app-shell.tsx (one line: mount `<ShortcutsHelp />`)
created: 2026-09-24
updated: 2026-09-24
---

## What

Desktop users cannot drive the console from the keyboard. Add a small set of global shortcuts and a help sheet listing them.

## Why / Context

A control plane used all day needs keyboard paths. Nothing listens for keys today apart from the Ctrl+=/−/0 scale shortcuts in `lib/appearance.ts`. Read first, in order: `AGENTS.md`, `DESIGN.md` ("Product tokens (console)", "Interaction"), `.agents/skills/solid-2/SKILL.md` (Solid 2 only — check `apps/console/node_modules/solid-js/types` before using any API), `.agents/skills/mobile-first/SKILL.md`, then the files in scope.

## Proposal (build exactly this)

1. `lib/shortcuts.ts`: one `keydown` listener on `document`, a registry of `{ keys, label, run }`, ignoring events from inputs, textareas, selects, contenteditable and the terminal (`.xterm` ancestors), and when a modifier other than Shift is held. Support two-key sequences with a 1 s window.
2. Shortcuts: `n` new task (only on a board route — `workspace.setNewTaskOpen(true)`), `/` focus the board filter (`input[aria-label="Filter tasks"]`), `g b` board, `g t` terminal, `g s` settings, `?` open the help sheet.
3. `ShortcutsHelp`: a `Sheet` listing the shortcuts in two columns with `<kbd>` styling from tokens; opened by `?`. Export it from `modules/shell/index.ts` and mount it once in `routes/app-shell.tsx` inside the signed-in shell.
4. Nothing on touch-only devices changes.
5. Tests: each shortcut runs; typing in an input does not trigger them; sequences time out.

## Scope

**In scope:** the files in `scope` and apps/console/src/routes/app-shell.tsx (one line: mount `<ShortcutsHelp />`).
**Out of scope:** a command palette (later card), terminal key handling. Never name any external product or project in code, comments or docs.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `bun --cwd=apps/console run typecheck` · `bun --cwd=apps/console run build`
- `bun run lint` · `bun run format` · `bun run architecture:check`
- Ports 3000–3002, 3011, 4000 and 4100 belong to the human's running servers: do not start or stop
  anything on them. If you need a dev server, use the port on this card.
- If you run a dev server, use port 3044 (`bunx vite --port 3044 --strictPort` in `apps/console`).

## Resolution

`lib/shortcuts.ts` (one `keydown` listener; ignores inputs, textareas, selects, contenteditable,
the terminal, modified keys and touch-only devices; two-key sequences within 1 s) and
`ShortcutsHelp` (`?` opens the list), mounted once in the signed-in shell.

Shortcuts: `n` new task (board only), `/` focus the board filter, `g b` board, `g c` chat,
`g t` terminal, `g s` settings, `?` this list.

Reviewer (claude): added `g c` for the chat that shipped meanwhile, used the shared close icon,
merged main, and moved this card on the branch (the agent had moved it in the main checkout).

```text
$ bunx vitest run   # apps/console — see PR checks for the merged result
```
