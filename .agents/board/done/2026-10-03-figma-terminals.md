---
id: str-figma-terminals
title: Terminals match the Figma 15 Simple and Sessions frames (agent parts left for later)
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/figma-terminals
worktree: none
scope:
  - apps/runner/src/terminals.ts
  - apps/runner/src/terminal-status.ts
  - apps/runner/src/pty.ts
  - apps/runner/src/server.ts
  - apps/console/src/modules/terminal/**
  - apps/console/src/kit/terminal.tsx
  - apps/console/src/modules/shell/components/sidebar.tsx
created: 2026-10-03
updated: 2026-10-03
---

## What

Figma "15 · Terminals", the plain terminal frames (Simple, desktop and phone; Sessions, phone):
the panel lists the shells with what each is doing, the tabs sit in the terminal's own dark top
strip with where it is, and phones list sessions as cards before opening one.

## Scope

**Left for later, by the human's choice:** the agent parts of the frames — "Agent first",
the "Claude Code wants to run" approval, "waiting on you", the "Ask an agent" composer, and
failing-test counts read from an agent's run.

## Resolution

**Runner** — `terminal-status.ts`: per shell, its folder now (`/proc/<pid>/cwd`), the foreground
command (the terminal's foreground process group, when it is not the shell's), the TCP ports its
processes listen on (`ss -ltnpH`, matched to the shell's process tree, read once per request),
the git branch and commits ahead of upstream, and its last three lines with escapes and redraws
removed. `GET /terminals?status=1` returns them; terminals keep `endedAt`. Linux reads `/proc`;
elsewhere those fields stay empty.

**Console** — panel: each machine's shells (globe and "localhost:5173" while serving, the command
in amber while one runs, the folder at the prompt; a dot each) and Recent ("exit 130 · 2d ago").
Top bar: the terminal's name, New tab, ⋯ (text size, close). The terminal: dark whatever the
theme, its tabs in a top strip with the machine, folder and branch (↑ahead) on the right.
Phones: Terminals with a card per session (its dot, name, what it does, last lines); one opens
with back, its name and "machine · folder", the status line (branch, what it does) and the key
row. Status refreshes every 4 s while visible; lists are keyed by id, so a refresh never remounts
a live terminal. Kit: TerminalPanelRow, TerminalGroupLabel, TerminalTabs, TerminalFrame,
TerminalBranch, TerminalStatusLine, TerminalSessionCard.

## Validation

- `bun run lint` 0, `bun run typecheck` 0, `vite build` OK.
- Console vitest 82 files / 527 tests (new: terminal look — dot and detail per state, ~ paths).
- Runner 323 pass (new: ports matched to the shell's processes, preview lines without escapes
  or redrawn lines, a real shell's folder and foreground command; `?status=1`; `endedAt`).
- Chromium against this branch's runner: 1440×900 light — a shell serving `python3 -m
  http.server 8765` showed a globe, "localhost:8765" and the branch `main`; `sleep 300` showed in
  amber; 390×844 — the empty list, a session card with its last lines, the opened terminal's
  header, strip, status line (`main`, `~/Projects/grid`) and key row.

## Review

Found while testing: the phone list mounted xterm inside a hidden frame (now mounted only once a
terminal is opened), and each 4 s refresh rebuilt every row and would have remounted the live
terminals on desktop (lists now keyed by id). The phone terminal's canvas does not appear in
the browser pane's phone emulation screenshots, on main as well; desktop renders.
