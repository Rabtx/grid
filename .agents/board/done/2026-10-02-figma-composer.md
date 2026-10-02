---
id: str-figma-composer
title: Composer matches the Figma 10 Composer frames
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-threads]
branch: agent/web/figma-composer
worktree: none
scope:
  - apps/console/src/kit/**
  - apps/console/src/modules/chat/**
  - apps/console/src/modules/voice/**
  - packages/tokens/src/kit.css
created: 2026-10-02
updated: 2026-10-02
---

## What

The message box rebuilt to Figma "10 · Composer": model picker, attach menu, mentions,
attachments, voice, context and key hints. Desktop and phone, light and dark.

## Scope

**Out of scope (no backend yet, so not drawn rather than faked):** skills, MCP servers, web
search, screenshots, recent photos strip, threads in @-mentions, "Plan first" (the mode chip
still sets plan mode), time and credit estimates per effort, per-model ⌘-number shortcuts.
Favourites from other agents no longer have a view of their own (favourites still sort first).

## Resolution

**Changed**
- Model picker: chip "Agent · Model" with the agent's logo; panel with an Agent section (rows on
  desktop, pills on phones; who makes it, sign-in needed) when there is a choice, model rows
  with tiles (check on desktop, radio on phones), search, favourites first and lab headings for
  long lists, and the effort slider as a lit round track with a white knob and level names.
  Phone sheet titled "Agent & model".
- Popovers inside the composer open above the whole card (or below when there is more room),
  hold their edge as content changes, and follow resizes; phone sheets can carry a title and
  close button.
- Attach menu: Upload files (⌘/Ctrl U), Add from project, Mention a file, Commands; on phones
  an "Add to message" sheet with Photos, Camera, Files, Project tiles.
- @-mentions and / commands: raised card, "Files in <project>", file-type icons, folder line,
  ↵ on the active row.
- Attachments above the text: thumbnail or file tile, name and size or folder, round remove.
- Context ring with percent and "Context N% · Xk of Yk tokens".
- Key hints under the composer on a physical keyboard.
- Voice: dictating into the composer shows a recording bar in it (cancel, timer, the
  microphone's real level as a waveform, or the words heard so far, done); the app-wide bubble
  stays away for it.

**Validation** — typecheck clean; lint 0 errors; 75 files / 492 tests (new VoiceBar,
ContextMeter and picker tests); build OK; Chromium at 1440×900 and 390×844, light and dark:
model picker (one agent and, with the providers response widened, five), attach menu and
sheet, mentions against a seeded project, attachments, and voice with Chromium's fake
microphone through the runner engine; no page errors.

**Review** — independent reviewer: 8 findings, all fixed — cancel during the microphone
prompt left it recording; dictation orphaned when the composer unmounts; focus lost while
dictating; the bar built three times per render; popover drift, no flip, no resize; stars
hidden on touch; a swipe on the effort track changed the level; camera capture dropped, no
keyboard for short model lists, late level readings, a suspended AudioContext on Safari, and
radios without arrow keys.
