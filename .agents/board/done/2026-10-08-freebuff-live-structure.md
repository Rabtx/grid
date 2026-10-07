---
id: grid-freebuff-live-structure
title: stream freebuff replies as tools, reasoning and text, and read its new model picker
type: bug
from: pm
to: runner
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: agent/runner/freebuff-live-structure
worktree: ../grid-worktrees/freebuff-live
scope: [apps/runner/src/agents/freebuff*.ts, apps/runner/src/agents/events.ts, apps/runner/src/agents/testing/**, apps/console/src/modules/chat/lib/transcript*.ts, apps/console/src/modules/chat/types/chat.types.ts]
allowed_shared: []
created: 2026-10-08
updated: 2026-10-08
---

## What

A Freebuff reply streams differently from every other agent's. Its live view comes from Freebuff's terminal screen, read as plain text:

- Tool rows (`• Read …`, `• Glob …`, `$ command` and its output) land in the reply as text.
- Every row the terminal wrapped becomes a hard line break, in prose and in paths.
- Once the screen is redrawn the stream stops until the turn ends, so for minutes nothing moves.

Separately, Freebuff's model picker changed layout. It now reads `Name • effort · traits`, and long labels wrap onto a second row. Models without reasoning levels are read with their traits as part of the name (`MiMo 2.6 Flash · Balanced · Images`). Choosing one then fails, because the status line names just the model. A wrapped label adds a junk model (`Promotional · 1 session a day`) and loses the real one (GPT-6.1 Sol).

## Proposal or Ask

- **Reading the screen:** read each reply as ordered segments: reasoning (`• Thinking`), tools (`• Name input`, `$ command` plus output) and text. Rejoin wrapped rows. Stream text and reasoning as deltas and tools as tool events. On a redraw, resync with a throttled `turn_rewrite` instead of going quiet.
- **End of the turn:** `turn_rewrite` gains `replaceTools`, so the exact turn from the chat file replaces the screen's tool cards too.
- **Model picker:** read each model from its box, so wrapped labels and costs work in both the old and new formats.

## Validation

- Runner tests on screens captured from the live CLI (tool rows, wraps, commands, picker).
- Console transcript test for `replaceTools`.

## Resolution
Fixed by claude, 2026-10-08.

- **Live stream (`freebuff-screen.ts`):** `parseSegments` reads a reply as ordered parts:
  - `• Thinking` becomes reasoning.
  - `• Name …` becomes a tool, using Freebuff's own tool names, longest first ("Read URL" before "Read").
  - `$ command` becomes a Run step with its output; "Show N more lines" is dropped.
  - Everything else is the answer.
  - Rows the terminal wrapped are rejoined: at a space, or straight on after a `/` or `-`. Short rows, list items, quotes and code keep their breaks.
  - `ReplyTracker` returns these parts and leaves out the half-drawn last row while the reply runs.
- **`ReplyStream` (`freebuff.ts`):** text and reasoning go out as deltas and tools as tool events, each settled to completed when the next part appears. A redrawn screen is restated with `turn_rewrite`, at most every 2 s, instead of stopping the stream. The turn still ends with the exact events from the chat file.
- **`turn_rewrite.replaceTools`:** the restatement now also replaces the screen's tool cards, keeping the order. It repeats the "Freebuff session" card. Older logs without the flag replay as before.
- **Picker:** each model is read from its own box, in the new and old layouts, including wrapped labels and costs:
  - `MiMo 2.6 Flash` and others now get clean ids. Before, they carried their traits, so switching to them failed.
  - The junk "Promotional · 1 session a day" entry is gone and GPT-6.1 Sol is back.
  - A model that defaults to `medium` lists low, medium and high. The real levels are still read under Tab when one is chosen.
- **Evidence:**
  - Screens captured from the live CLI in a scratch folder: picker and reasoning list only; no message was sent and nothing was spent.
  - The rows of a real streamed turn from the runner's log, run through `parseSegments`: every tool row came out as a tool.
- **Checks:**
  - Runner: 514 / 514 (new screen, stream and picker tests; the fake CLI now draws the new picker and a tool row).
  - Console: 721 / 721 (new `replaceTools` transcript test).
  - Typecheck, lint and format pass.
