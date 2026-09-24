---
id: str-console-touch-targets
title: Finger-sized controls on touch screens across the console primitives
type: feature
from: ui-ux
to: web
priority: high
status: open
assignee: none
reviewer: claude
parent: .agents/plans/console-design-migration.md (UX polish round)
depends_on: []
branch: agent/web/console-touch-targets
worktree: ../grid-worktrees/agent/web/console-touch-targets
port: 3042
scope:
  - apps/console/src/ui/button.tsx
  - apps/console/src/ui/segmented-control.tsx
  - apps/console/src/ui/menu.tsx
  - apps/console/src/ui/select.tsx
  - apps/console/src/ui/field.tsx
  - apps/console/src/ui/primitives.test.tsx
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

On phones the console's icon buttons are 28 px and small buttons 24 px — hard to hit with a thumb. Make every interactive primitive at least 40 px tall/wide on coarse pointers, without changing the desktop look.

## Why / Context

The skill `.agents/skills/mobile-first` asks for ≥40 px touch targets. The primitives in `apps/console/src/ui` size themselves with the density tokens (`h-control`, `h-row`, `size-6`) that are tuned for a mouse. Read first, in order: `AGENTS.md`, `DESIGN.md` ("Product tokens (console)", "Interaction"), `.agents/skills/solid-2/SKILL.md` (Solid 2 only — check `apps/console/node_modules/solid-js/types` before using any API), `.agents/skills/mobile-first/SKILL.md`, then the files in scope.

## Proposal (build exactly this)

1. Branch on capability, not width: use Tailwind's `pointer-coarse:` variant (already used in the codebase, e.g. `modules/projects/components/task-card.tsx`).
2. `IconButton` (both sizes) and `Button` `sm`/`md`: on `pointer-coarse:` the hit area is ≥40 px. Prefer enlarging the hit area over the visual (e.g. a transparent `::before` inset of −6px/−8px, or `min-h-10 min-w-10`) where a bigger visual would crowd dense rows; state which one you chose per primitive.
3. `SegmentedControl` segments, `Menu` items, `Select`, and `Input` fields: ≥40 px tall on coarse pointers; menu items ≥44 px.
4. Keep focus rings, disabled states and desktop sizes exactly as they are (fine pointers must render pixel-identical — compare `/dev/ui` at 1280 px before/after).
5. Add a test in `primitives.test.tsx` asserting the coarse-pointer classes are present on each primitive.

Done when every control in `/dev/ui` measures ≥40 px in Chrome devtools with touch emulation at 375 px.

## Scope

**In scope:** the files in `scope`.
**Out of scope:** feature components outside `ui/`, tokens (`packages/tokens`), new primitives. Never name any external product or project in code, comments or docs.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `bun --cwd=apps/console run typecheck` · `bun --cwd=apps/console run build`
- `bun run lint` · `bun run format` · `bun run architecture:check`
- Ports 3000–3002, 3011, 4000 and 4100 belong to the human's running servers: do not start or stop
  anything on them. If you need a dev server, use the port on this card.
- If you run a dev server, use port 3042 (`bunx vite --port 3042 --strictPort` in `apps/console`).

## Resolution

<Filled by the resolver.>
