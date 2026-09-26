---
id: str-console-design-system
title: Console rewrite on a design system taken from the references
type: feature
from: human
to: web
priority: high
status: doing
assignee: web
reviewer: human
parent: none
depends_on: []
branch: agent/frontend/design-system-kit
worktree: ../grid-worktrees/kit
scope:
  - apps/console/**
  - packages/tokens/**
  - DESIGN.md
allowed_shared: []
created: 2026-09-27
updated: 2026-09-27
---

## What

An end-to-end UI/UX rewrite of the console. First a design system (`src/kit`, `kit.css`) taken
closely from the reference designs and shown at `/design`, approved by the human; then every
screen rebuilt on it (shell, home and composer, chat and work panel, board, files and notes,
terminal, settings, sign-in and onboarding, members), deleting `@/ui` as screens move.

## Why / Context

The first redesign pass restyled existing screens and did not land. The human chose: follow the
references very closely, Inter, fix look and feel and navigation/layout, gallery first.

## Progress

1. **Kit and gallery (this branch).** Tokens, Inter, 20 component families, `/design` with an
   app preview, light and dark, phone and desktop. Awaiting the human's review.

2. **Hardened kit.** Tweak knobs (roundness, spacing, lines) on top of the tint, saved per
   device; named surface, ring and shadow utilities replacing one-off values; `variants()` for
   every recipe; layout (`Stack`, `Row`, `Grid`, `Page`, `PageHeader`, `Section`) and text
   (`Text`, `Heading`) primitives; icons moved into the kit with sizes; `ProviderMark`,
   `Terminal`, `Suggestions`, `ListCard`, `WorkspacePreview`, `menuTrigger`; the interactive
   prototype and the component sections; and `kit-guard.test.ts` holding kit-built files to
   no inline or one-off styling.

### Validation

- typecheck, lint, architecture check pass; console vitest 45 files / 282 tests pass.
- Hardening: console vitest 47 files / 285 tests (guard and `variants` tests added); roundness
  knob checked live across the prototype.
- `/design` checked at 1100px and 375px, light and dark; menus, dialog, drawer and palette
  opened.
