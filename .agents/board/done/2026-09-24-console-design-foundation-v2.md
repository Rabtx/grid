---
id: str-console-design-foundation-v2
title: Ink design system, UI primitives and the re-skin of existing console screens
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: human
parent: .agents/plans/console-design-migration.md (steps 0.1–0.4, 1.1–1.4)
depends_on: []
branch: agent/ui-ux/console-design-foundation-v2
worktree: ../grid-worktrees/agent/ui-ux/console-design-foundation-v2
scope:
  - packages/tokens/src/product.css
  - apps/console/src/**
  - DESIGN.md
  - .agents/plans/**
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Phase 0 and Phase 1 of the console design migration: move the product tokens onto the
prototype's two-colour ink model, add the console's UI primitives with a dev-only gallery, and
re-skin every existing screen (sign-in, shell, board, system states) onto them. Behaviour and
API use are unchanged.

## Why / Context

The human designed Grid's product UI as a prototype kept outside the repo; the plan
(`.agents/plans/console-design-migration.md`) rebuilds it in Solid step by step. Decisions taken
with the plan's recommended defaults: keep Grid's seven stages, follow the OS theme, match the
dense desktop scale from `md:` up, the human's prototype and its design doc win conflicts.

## Resolution

- **Tokens** (`packages/tokens/src/product.css`): canvas + one ink per theme from `--hue` /
  `--saturation`; ink-mix ladder used as `bg-ink/5`, `text-ink/50`, `border-ink/10`; `stroke`,
  a five-step selection ladder (softer in light), signals `accent / link / success / danger /
  warning`, stage colours as signals; phone type scale below `md:` and the dense desktop scale
  (10–13px, 20px title) from `md:`; `h-row` / `h-control` 28px and `h-field` 36px on desktop with
  a 44px floor on coarse pointers; radii 4/6/8/12; motion 120/160/260ms with `ease-sheet`;
  `glass` and `focus-ring` utilities. Legacy shadcn names are mapped onto the model; `apps/web`
  is untouched (it does not import `product.css`).
- **Primitives** (`apps/console/src/ui/`): Button (primary ink inversion, secondary, ghost,
  danger; sm/md/lg), IconButton (labelled), Input + Field (label, hint, error), SegmentedControl
  (`aria-pressed` in a fieldset), Chip, Caption, EmptyState, ErrorNotice, Skeleton, Sheet (one
  modal `<dialog>` for bottom sheets and side drawers), one icon set. `primitives.test.tsx`
  covers their states. `/dev/ui` (dev builds only; absent from the production bundle) shows
  every primitive, the ink ladder and signals, with theme and density switches.
- **Re-skin**: sign-in on Field/Input/Button with an inline error strip; glass sidebar (13rem)
  with Board, captioned Projects and account; phone top bar and drawer on `Sheet`; 40px desktop
  header with the ink-inverted New task; new-task sheet on `Sheet`; board lanes with
  `StatusIcon` (shape + colour per stage), flat ink cards, dashed empty lanes, stage tabs on the
  selection fill; system screens on EmptyState / ErrorNotice. Tests now select on semantics and
  `data-count` hooks instead of styling classes.

Validation (2026-09-24):
- console tests `19 passed (19)` on two consecutive runs; typecheck 0 errors; console build
  `✓ built` (gallery string absent from the bundle); `apps/web` build `✓ Compiled successfully`;
  `bun run lint` exit 0; `architecture:check` OK; no `max-*:` variants.
- Browser against the API with the seeded account: 375px dark and light — sign-in, board with
  44px stage tabs, no horizontal scroll, drawer navigates to `/board/platform` and closes, New
  task sheet opens with a focused 16px input; 1280px dark — glass sidebar, 40px header, dense
  lanes and cards matching the prototype's board.
