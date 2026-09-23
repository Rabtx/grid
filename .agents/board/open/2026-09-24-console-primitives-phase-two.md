---
id: str-console-primitives-phase-two
title: Console primitives for phase 2 — textarea, select, menu, confirm, side panel
type: feature
from: human
to: web
priority: high
status: open
assignee: none
reviewer: claude
parent: .agents/plans/console-design-migration.md (phase 2 prerequisite)
depends_on: []
branch: agent/web/console-primitives-phase-two
worktree: ../grid-worktrees/agent/web/console-primitives-phase-two
scope:
  - apps/console/src/ui/**
  - apps/console/src/routes/dev-ui.tsx
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Add the primitives phase 2 needs to `apps/console/src/ui/`: **Textarea**, **Select**, **Menu**
(a small action/option popover), **ConfirmDialog**, and a new **`panel`** placement for the
existing `Sheet`. Show each in the dev gallery and cover each with a component test.

## Why / Context

Phase 2 of `.agents/plans/console-design-migration.md` adds a task panel, board views and moving
tasks. Those cards build on these primitives; doing them first keeps the other cards from each
inventing their own. Read first, in order: `AGENTS.md`, `DESIGN.md` → "Product tokens (console)",
`.agents/skills/solid-2/SKILL.md`, `.agents/skills/mobile-first/SKILL.md`, then every file in
`apps/console/src/ui/` (especially `button.tsx`, `field.tsx`, `sheet.tsx`) — copy their patterns,
comment style and class recipes exactly.

## Proposal (build exactly this)

Style rules: only ink tokens (`bg-ink/5`, `text-ink/50`, `border-ink/10`, `bg-selection`,
`text-danger`…), sizes `h-control` / `h-field` / `h-row`, text `text-ui*`, radius `rounded-md`
(controls) / `rounded-xl` (floating), motion `duration-fast|base|slow` + `ease-out-grid|ease-sheet`,
`focus-ring` for keyboard focus. `apps/console/src/styles/tokens.test.ts` must stay green.
No new dependencies.

1. **`Textarea`** (`field.tsx`): same look as `Input` (`border-ink/12`, `bg-canvas/40`,
   `text-ui-input`, focus `border-ink/30`), `min-h-24`, `py-2`, `resize-y`, forwards all
   `<textarea>` props. Works inside `Field`.
2. **`Select`** (`select.tsx`): a styled **native** `<select>` (native is best on phones):
   `h-field`, `appearance-none`, same border/background as `Input`, right padding for a
   `ChevronDownIcon` drawn over it (add that icon to `icons.tsx`: path `m6 9 6 6 6-6`),
   `pointer-events-none` on the icon. Props: `options: readonly { value: string; label: string }[]`,
   `value`, `onChange(value: string)`, plus `aria-label`/`disabled`/`name` passthrough.
3. **`Menu`** (`menu.tsx`): a trigger button plus a list of actions, built on the native
   **Popover API** (`popover="auto"` on the list, `popovertarget` on the trigger) — that gives
   light-dismiss and Escape for free.
   - Props: `label` (accessible name of the trigger), `trigger: JSX.Element` (the trigger's
     content, e.g. an icon), `items: readonly { id: string; label: string; icon?: JSX.Element;
     danger?: boolean; disabled?: boolean }[]`, `onSelect(id: string)`.
   - Items are `<button>`s, `h-row rounded-md px-2 gap-2 text-ui-sm text-ink/80 hover:bg-ink/10`,
     danger items `text-danger hover:bg-danger/10`. Selecting calls `onSelect` and hides the popover
     (`hidePopover()`).
   - Surface: `rounded-xl border border-ink/10 bg-canvas p-1 shadow-xl`, `min-w-44`.
   - **Phones (default):** the list is a bottom sheet — fixed to the bottom, full width,
     `rounded-t-xl`, padded for `env(safe-area-inset-bottom)`. **From `md:`:** positioned under
     the trigger. Use CSS anchor positioning (`anchor-name` on the trigger, `position-anchor` +
     `position-area: block-end span-inline-end` + `position-try-fallbacks: flip-block` on the list)
     via Tailwind arbitrary properties or a small `@utility` inside `menu.tsx`'s scope — **check
     current browser support on MDN first**; if Firefox lacks it, add a fallback: when
     `CSS.supports("position-area: block-end")` is false, position the list from
     `trigger.getBoundingClientRect()` on `toggle` (open) events.
   - Keyboard: ArrowDown/ArrowUp move focus between items, Home/End jump, focus the first item on
     open, return focus to the trigger on close.
4. **`ConfirmDialog`** (`confirm-dialog.tsx`): built on `Sheet` (bottom placement). Props:
   `open`, `title`, `description?`, `confirmLabel`, `tone?: "danger" | "default"`, `pending?`,
   `onConfirm()`, `onCancel()`. Layout: title `text-ui font-semibold`, description
   `text-ui-sm text-ink/70`, actions right-aligned from `md:` (stacked, confirm on top, on phones):
   `Button variant="ghost"` Cancel, then `Button` confirm — `variant="danger"` when `tone="danger"`
   but with a solid fill here only (add a `danger-solid` variant to `button.tsx`:
   `bg-danger text-canvas hover:bg-danger/90`; DESIGN.md allows a solid red fill only for a
   confirm dialog's final action). Focus the Cancel button on open (the safe choice).
5. **`Sheet` `panel` placement** (`sheet.tsx`): full-screen on phones (`h-dvh w-full max-w-none`,
   safe-area padding top and bottom, slides up like `bottom`); from `lg:` a right-hand side panel
   (`lg:ml-auto lg:mr-0 lg:h-dvh lg:w-[min(30rem,100vw)] lg:border-l lg:border-ink/10`, slides in
   from the right: `lg:translate-x-full lg:open:translate-x-0 lg:starting:open:translate-x-full`,
   no vertical translate at `lg:`). Keep `bottom` and `side` unchanged.
6. Export everything from `ui/index.ts`. Add a section per primitive to `routes/dev-ui.tsx`
   (a Textarea field, a Select, a Menu with a danger item, a button opening a ConfirmDialog,
   a button opening a `panel` Sheet).
7. **Tests** in `ui/primitives.test.tsx` (happy-dom; follow the existing tests there):
   Textarea forwards value/onInput; Select renders options and calls `onChange`; Menu renders
   its items, calls `onSelect` with the id, marks the trigger with `popovertarget`; ConfirmDialog
   calls `onConfirm`/`onCancel` from the right buttons. If happy-dom lacks the Popover API or
   `showModal`, stub them in the test (`HTMLElement.prototype.showPopover = vi.fn()` etc.) —
   don't skip the test.

## Scope

**In scope:** `apps/console/src/ui/**`, `apps/console/src/routes/dev-ui.tsx`.
**Out of scope:** everything else — board, shell, tokens, other apps. Do not change existing
primitives' behaviour except adding the `danger-solid` button variant and the `panel` placement.
Never name any external product or project in code, comments, docs or commits.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `bun --cwd=apps/console run typecheck` ·
  `bun --cwd=apps/console run build` · `bun run lint` · `bun run format` · `bun run architecture:check`
- The dev servers on ports 3000, 3001 and 4000 belong to the human — do not start or stop
  anything on them. The reviewer checks `/dev/ui` in a browser at 375 and 1280 px.

## Resolution

<Filled by the resolver.>
