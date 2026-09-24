---
id: str-console-toasts
title: Toasts for action feedback, and a faster new-task flow
type: feature
from: ui-ux
to: web
priority: normal
status: open
assignee: none
reviewer: claude
parent: .agents/plans/console-design-migration.md (UX polish round)
depends_on: []
branch: agent/web/console-toasts
worktree: ../grid-worktrees/agent/web/console-toasts
port: 3043
scope:
  - apps/console/src/ui/toast.tsx
  - apps/console/src/ui/toast.test.tsx
  - apps/console/src/ui/index.ts
  - apps/console/src/main.tsx
  - apps/console/src/modules/projects/components/new-task-dialog.tsx
  - apps/console/src/modules/projects/components/board-screen.test.tsx
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Actions finish silently: adding a task just closes the sheet. Add a small toast primitive and use it for task creation, and make adding several tasks in a row quick.

## Why / Context

DESIGN.md asks every surface to acknowledge actions. There is no feedback primitive besides the inline `ErrorNotice`. Read first, in order: `AGENTS.md`, `DESIGN.md` ("Product tokens (console)", "Interaction"), `.agents/skills/solid-2/SKILL.md` (Solid 2 only — check `apps/console/node_modules/solid-js/types` before using any API), `.agents/skills/mobile-first/SKILL.md`, then the files in scope.

## Proposal (build exactly this)

1. `ui/toast.tsx`: a module-level store (plain array + signal, no provider needed) with `toast({ message, action?: { label, onClick }, tone?: "neutral" | "danger" })` and a `<Toaster />` rendered once (mount it in `main.tsx` next to the app). Position: bottom centre above the safe area on phones, bottom right from `md:`. Auto-dismiss after 4 s (paused while hovered or focused), dismissible, max 3 stacked, `<output aria-live="polite">` for screen readers, motion via the duration/easing tokens and off under reduced motion. Export from `ui/index.ts`.
2. New task sheet: after "Add to backlog", show toast "Added TASK-n" with an "Open" action that opens the task (`workspace.openTask(n)`). Ctrl/⌘+Enter adds and keeps the sheet open with the input cleared and focused ("add another"); plain Enter adds and closes as today.
3. Tests: toast shows, auto-dismisses (fake timers), action fires; the new-task flow shows the toast and "add another" keeps the sheet open.

## Scope

**In scope:** the files in `scope`.
**Out of scope:** replacing existing `ErrorNotice` uses; the board lanes' move error (leave it as is); undo for deletes. Never name any external product or project in code, comments or docs.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `bun --cwd=apps/console run typecheck` · `bun --cwd=apps/console run build`
- `bun run lint` · `bun run format` · `bun run architecture:check`
- Ports 3000–3002, 3011, 4000 and 4100 belong to the human's running servers: do not start or stop
  anything on them. If you need a dev server, use the port on this card.
- If you run a dev server, use port 3043 (`bunx vite --port 3043 --strictPort` in `apps/console`).

## Resolution

<Filled by the resolver.>
