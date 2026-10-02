---
id: str-figma-files-gaps
title: Files fills the Figma 13 gaps — agent attribution, Mine, Blame, symbols, caret, minimap
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: str-figma-files
depends_on: [str-figma-files]
branch: agent/web/figma-files-gaps
worktree: none
scope:
  - apps/runner/src/folders/**
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/store.ts
  - apps/runner/src/server.test.ts
  - apps/console/src/modules/projects/**
  - apps/console/src/kit/code-lines.tsx
  - apps/console/src/kit/tree.tsx
  - apps/console/src/kit/index.ts
created: 2026-10-03
updated: 2026-10-03
---

## What

The parts of Figma "13 · Files & Editor" that `str-figma-files` left out because nothing backed
them, now built end to end: which agent made a change, the Mine filter, Blame, the symbol in the
breadcrumb, line and column and indentation in the status strip, the minimap, and the phone
"Changed by agents" list.

## Resolution

**Runner** — `project-git.ts`: each last commit carries `email`, `agent` (from the author or a
`Co-authored-by` trailer: Claude, Codex, opencode, Antigravity, Freebuff) and `mine` (committed
as this folder's `git config user.email`); `blame()` reads `git blame --porcelain` and the
co-author trailers of every blamed commit in one `git show`. The chat store keeps `agent_edits`
(the last agent, thread and time per file, by real path), recorded by the hub from every tool
event with diffs that did not fail. Listings and file reads mark a change as an agent's when an
agent edited the file after the checked-out commit, with the thread's id and title.
`GET /projects/files/:slug/blame?path=` returns runs of lines and their commits (lines not
committed are the editing agent's, or yours).

**Console** — folder: the header tells the story ("Claude Code changed 2 files · 2m · Round
job ETAs"), All / Changed / Mine (Mine: your commits and your own uncommitted edits), each row's
latest change by its agent's logo (uncommitted agent work by its thread) or the author's initial;
on phones "Changed by agents · Review" first, then other changes, then the folder, and the
filter under the search. File: Code / Changes / Blame (a row of its own on phones), "Edited by
Claude Code · 2m" or "Committed by Codex · 2d" in the path bar, the function or class around the
caret after the file name (CodeMirror's Lezer parsers: TS/JS, Python, Rust), `Ln 9, Col 42` and
`Spaces: 2` / `Tabs` in the status strip (`Ln` on the phone foot bar), and a minimap on large
screens (changed lines marked, the visible part framed, press or drag to scroll). Kit:
`CodeLines.onCaret`, `CodeMinimap`, `BlameLines`, `FileRow.detailLead`.

**Also fixed** — the folder picker ("Choose folder") halted the whole console: its `start` prop
is a conditional the compiler turns into a memo on first read, and it was first read inside
`onSettled`. Read once in the component body now.

**Left out** — nothing from the frames. Agent edits made before this runner version have no
record, so older uncommitted changes show as yours until committed.

## Validation

- `bun run lint` exit 0, `bun run typecheck` exit 0.
- Console vitest: 81 files / 521 tests (new: symbols ×3, file-git indentation, blame runs, mine).
- `vite build` OK.
- Runner `bun test`: 316 pass, 0 fail (new: agentOf, mine, blame incl. uncommitted lines;
  agent edits from tool events, failed edits ignored; files listing attribution and the blame
  route incl. a path outside the project).
- Chromium against this branch's runner on :4101 (own chat database) and a demo repository
  (`~/Projects/grid-files-demo`: a Codex co-authored commit, a commit by someone else, two
  uncommitted Claude Code edits): 1440×900 light and dark, 390×844 dark — folder header, Mine,
  Changed by agents, Blame runs, symbol crumb `roundEta`, `Ln 9, Col 33`, minimap.

## Review

Self-review of the diff: agent edit paths are now recorded with symlinks in their folder
followed (a linked projects folder would otherwise never match); the blame column stretches the
height of its run; the view switcher moved to its own row on phones (it pushed Blame off screen);
the phone filter row stacks under the search.
