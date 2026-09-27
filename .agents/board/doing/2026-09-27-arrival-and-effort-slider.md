---
id: str-arrival-and-effort-slider
title: A new flagship celebration and a calm, animated effort slider
type: feature
from: human
to: ui-ux
priority: medium
status: doing
assignee: ui-ux
reviewer: human
parent: none
depends_on: []
branch: agent/ui-ux/arrival-and-effort
worktree: ../grid-worktrees/agent/ui-ux/arrival-and-effort
scope:
  - apps/console/src/kit/arrival.ts
  - apps/console/src/kit/effort.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/settings/components/appearance-screen.tsx
  - apps/console/src/routes/design/more-sections.tsx
  - packages/tokens/src/kit.css
created: 2026-09-27
updated: 2026-09-27
---

## What

Human feedback: the "grid ignition" celebration and the sparking effort slider were not good.
Replaced with the warp arrival (stars streaming out, a flash and shockwave, the model's name
rising with a light sweep and a caption, embers; in each lab's colours, ~3.5 s, dismissed by
any key or press; desktop only, never with reduced motion) and a calm, ChatGPT-like stepped
slider (stops, a springing thumb, a light sweeping along the fill, the level and its meaning
rolling in, a soft glow at the top level). Both are in the design gallery.

## Validation

- Console `vitest run`: 303 pass (slider: roll, sweep, glow at the top; labs' colours).
- Browser: the slider and the arrival in the design gallery, frame by frame.
