---
id: str-premium-detailing
title: "Premium detailing: depth across the kit, the composer and the model picker"
type: feature
from: human
to: ui-ux
priority: normal
status: doing
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/ui-ux/premium-detailing
worktree: ../grid-worktrees/agent/ui-ux/premium-detailing
scope:
  - DESIGN.md
  - packages/tokens/src/kit.css
  - apps/console/src/kit/**
  - apps/console/src/modules/chat/components/composer.tsx
  - apps/console/src/modules/chat/components/conversation.tsx
  - apps/console/src/modules/chat/components/pickers.tsx
  - apps/console/src/modules/chat/lib/choices*.ts
  - .agents/board/**
allowed_shared: []
created: 2026-09-28
updated: 2026-09-28
---

## What

Small moves that make the console feel premium, plus a redesign of the composer and the model
picker, in one pull request to be tried on this branch before merging.

## Why / Context

The console was clean but flat: one surface colour and hairlines, so nothing felt layered, lit or
pressable. The composer's send button looked dead, its context percentage had no label and the
folder strip hung loose under it. The model picker read like a debug panel: a rail of single
letters, model ids under every name, "5 efforts" on every row, a "Default" row duplicating the
model it stands for, and a thin effort slider.

## Proposal or Ask

- **Depth (tokens, kit-wide):** a lit top edge on raised things, two-layer shadows on floating
  layers, a faint light at the top of the canvas, pressable primary buttons, the selected sidebar
  row lifted off the frame, an accent halo on the focused composer, fading dividers. Written into
  `DESIGN.md` under "Depth and material".
- **Composer:** one lit card with the folder and branch strip along its bottom edge; send fills
  and comes forward when there is something to send; a ring turns around stop while the agent
  works; context is a small gauge (amber from 80%, red from 95%) with its number in the tooltip.
  Attachments are raised chips.
- **Model picker:** agent tiles tinted their own colour; the rail names each agent on desktop;
  rows show the description without the model id (the id is in the tooltip) and no effort count;
  the default model is one row with a "Default" badge; effort is a segmented control with a
  sliding accent knob that keeps the roll-in name, sweep and top-level glow.

## Validation

- `bun run lint`, `bun run typecheck`, `bun run format`, `bun run architecture:check`: pass.
- Console `bunx vitest run`: 66 files, 441 tests pass (new: model blurb and default folding;
  effort tests pass unchanged against the segmented control).
- Console `bun run build`: passes.
- Browser against the live runner, dark and light, 1280 px and 375 px: new chat, a conversation,
  the model picker with several agents, and the phone bottom sheet.

## Resolution

Open until the human has tried the branch and it is merged.
