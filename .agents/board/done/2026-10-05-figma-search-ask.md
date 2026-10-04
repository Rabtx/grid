---
id: str-figma-search-ask
title: Search & Ask Grid from Figma 25 — find anything, ask with cited answers
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-pulse]
branch: agent/web/figma-search-ask
worktree: none
scope:
  - apps/runner/src/search/**
  - apps/runner/src/chat/store.ts
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/server.ts
  - apps/runner/src/main.ts
  - apps/api/src/modules/projects/search.ts
  - apps/api/src/modules/workspaces/routes.ts
  - apps/api/test/contract/workspaces.test.ts
  - apps/console/src/modules/search/**
  - apps/console/src/modules/shell/**
  - apps/console/src/modules/home/components/home-screen.tsx
  - apps/console/src/kit/search.tsx
  - apps/console/src/kit/index.ts
created: 2026-10-05
updated: 2026-10-05
---

## What

Figma "25 · Search & Ask": the command palette as real search across the workspace, and Ask
Grid — questions answered from the work itself, every claim citing where it came from.

## Scope

Stacked on the Pulse branch. Search covers threads (by what was said in them), files, tasks,
notes, projects and commands, in the project you are in. Ask draws on notes, threads, tasks,
commits and pull requests the person can already see. **Left for later:** Figma's "open in split"
(Split view is its own screen), and the phone frames' composer-style Ask box on Home.

## Resolution

**Runner** — `ChatStore.searchText` (titles and messages, with a passage around the match);
`ChatHub.searchThreads` and `answerOnce` (an agent answers once, outside any thread, any tool it
asks for declined). `search/`: `GET /search` (threads, and files from `git ls-files` ranked by name);
`POST /ask` gathers sources — notes and tasks from the API asked as the person, threads, commits
(`git log --grep`), pull requests (`gh pr list --search`) — numbers them, asks the workspace's
default agent (the next one if it fails) to answer only from them with `[n]` citations and three
follow-ups, and checks the answer. Nothing found: says so without asking an agent.

**API** — `GET /workspaces/:ws/search?q=&project=`: tasks and notes matching any word, those
matching more first, with a passage.

**Console** — the palette: grouped results (Threads, Files, Tasks, Notes, Commands, Projects),
↑↓/↵, "Ask Grid about …" (Ctrl+↵), Tab between Search and Ask; Ask shows the question, the answer
with citation tiles, the cited sources (each opens), follow-up chips, Save as note, Ask a
follow-up. "Ask Grid" on Today opens it in Ask. Kit: `SearchPanel`, `SearchField`, `ResultGroup`,
`ResultRow`, `SearchFooter`, `KeyHint`, `Citation`, `CitedText`, `SourceRow`, `SourceList`,
`FollowUps`.

## Validation

- `bun run lint` 0, typecheck per package 0, `bun run architecture:check` OK, `vite build` OK.
- Console vitest 572 (new: palette search groups, Ask with cited sources only).
- Runner 404 (new: file ranking, question words, prompt, answer parsing, thread search by
  content and workspace, an answer without a thread, nothing found without an agent).
- API contract against this branch: workspaces 11 pass (new: search by words, per project, not
  across workspaces).
- Chromium on this branch: "worktree" found 6 threads by their content and the repo's files; Ask
  "Why do threads get their own git worktree?" answered from 10 sources it could see, citing the
  commit that made worktrees optional. Claude Code failed once on a sign-in refresh (another Claude
  process on the machine), which is why Ask now hands a question to the next agent.
