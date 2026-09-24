---
id: str-console-voice-input
title: Voice input everywhere — tap the mic, speak, and the words land at the cursor
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: claude
parent: none
depends_on: [str-console-terminal]
branch: agent/ui-ux/voice-input
worktree: ../grid-worktrees/agent/ui-ux/voice-input
scope:
  - apps/console/src/modules/voice/**
  - apps/console/src/modules/terminal/components/terminal-view.tsx
  - apps/console/src/modules/terminal/components/key-bar.tsx
  - apps/console/src/modules/terminal/components/terminal-screen.tsx
  - apps/console/src/routes/app-shell.tsx
  - apps/console/src/ui/icons.tsx
  - apps/runner/src/transcribe.ts
  - apps/runner/src/transcribe.test.ts
  - apps/runner/src/config.ts
  - apps/runner/src/server.ts
  - apps/runner/README.md
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

The human's ask: voice-to-text across the whole app, including the terminal (for driving agent
CLIs by voice). Tap a mic, speak, and the transcript is inserted at the cursor — the terminal,
any text field, and any future surface (a chat composer). Prefer the device's own speech engine.

## Resolution

### Design

- **Targets** (`modules/voice/lib/dictation-target.ts`): wherever the cursor is. Text fields
  and contenteditable work on their own (insert at the caret, space-separated, `input` fired so
  the app sees it). A surface that draws its own input registers itself with
  `registerDictationTarget(element, { insert, label })` — the terminal does, so words are typed
  into the shell (never with Enter). A future chat composer registers the same way.
- **Engines** (`lib/speech-engines.ts`), provider-agnostic:
  - `device` — the browser's recogniser (Android's speech service, Apple's on iOS/macOS, Chrome):
    free, streams words as they are spoken.
  - `runner` — where there is no recogniser (Firefox, Chromium on Linux): records with the mic
    and posts the clip to the runner's new `POST /transcribe`, which uses whatever the machine is
    configured with — any OpenAI-compatible transcription URL or a local command (whisper.cpp).
    A device engine that fails with "cannot run here" errors switches to the runner by itself,
    and the choice is remembered.
- **Controls** (`components/voice-controls.tsx`, mounted once in the shell): a mic floats above
  the on-screen keyboard while a text field is focused; a live bubble shows what is heard; Esc
  cancels; Ctrl/⌘+Shift+Space toggles from a physical keyboard. The terminal key bar has its own
  mic key (the floating one hides there). The mic never takes focus, so the cursor and the phone
  keyboard stay put.

### Validation output

```text
$ bunx vitest run      # apps/console
      Tests  112 passed (112)
$ bun test             # apps/runner
 20 pass
 0 fail
$ bun run typecheck    # console + runner clean;  bunx oxlint . → clean
```

Browser check — Chromium 375×740 with touch, a stand-in recogniser, mocked sign-in and runner:

```text
mic before focusing a field: 0
mic after focusing the filter: 1
bubble: Listening · into Filter tasks · fix the login
filter value: "fix the login bug" | still focused: Filter tasks
floating mic on terminal screen: 0
sent to the shell: ["git status"]
```

### Setup needed on this machine

The desktop browser here is Chromium on Linux, which has no recogniser, so voice there needs a
runner engine (`RUNNER_STT_URL` or `RUNNER_STT_COMMAND`, see `apps/runner/README.md`). Phones use
their own engine and need nothing.

### Later

Text-to-speech (reading agent replies aloud with the device's voices, `speechSynthesis`) fits the
same module when the chat lands.
