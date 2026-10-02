---
id: str-figma-files
title: Files match the Figma 13 Files & Editor frames
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-board]
branch: agent/web/figma-files
worktree: none
scope:
  - apps/runner/src/folders/**
  - apps/console/src/modules/projects/**
  - apps/console/src/kit/**
  - apps/console/src/styles/global.css
created: 2026-10-02
updated: 2026-10-02
---

## What

Files and the file reader rebuilt to Figma "13 · Files & Editor", desktop and phone, light and
dark, with the git story they show coming from the runner.

## Scope

**Out of scope (nothing backs them yet):** which agent made a change (git names the commit's
author), "Mine", blame, the symbol in the breadcrumb, a minimap, cursor line and column while
reading. The editor itself (CodeMirror) is unchanged.

## Resolution

**Runner** — `folders/project-git.ts`: the branch and what is changed (status and line counts)
in the project's own paths, each entry's last commit from one walk of the folder's history, and
a file as committed; all async (the runner also serves terminals), paths read literally, changes
capped. `GET /projects/files/:slug?git=1` carries the folder's git story; a file read carries its
change, last commit and (only when changed) the committed text.

**Console** — the tree in the panel (M/A marks, the open folder revealed). A folder (`?dir=`):
its header with the last commit and how much is changed, a filter and All/Changed, a framed
table of entries with Modified/Added and each one's last commit (a list on phones, changed files
first), and its README. A file (`?file=`): open files as tabs (kept per project), a path bar
with the last commit, Code/Changes (a diff against the last commit), Edit, Ask an agent, copy
path; lines highlighted with the change marked in the margin; selecting lines offers Ask /
Explain / Add test, which open a thread with the lines in it; a status strip (branch, changed,
language, machine); on phones a foot bar to edit or ask. Kit: CodeLines, CodeAskBar,
StatusStrip, FileRow, GitMark, GitBadge, framed Table, FolderTree reveal.

**Validation** — console typecheck clean, lint 0 errors, 77 files / 502 tests (folder git story,
Changed filter, numbered lines, line marks); runner tsc clean, 26 folder tests (project git in a
nested repository). Build OK. Chromium at 1440×900 and 390×844, light and dark, on a seeded repo.

**Review** — independent reviewer: 9 findings and 2 lows, all fixed — remembered tabs lost on a
file link (one effect now), git run synchronously and per entry (async, one log walk), the
folder read two or three times, names read as pathspecs, the committed text sent for every file,
deleted files linked, a stale README, the selection bar lost on touch and not on desktop
without a mouse (a bar Ask now), a tab closed before the unsaved-changes question, untracked
folders listed file by file, and a stale change after a save.
