---
id: str-figma-pulls
title: Pull requests match the Figma 18 frames — list, document, review changes
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/figma-pulls
worktree: none
scope:
  - apps/runner/src/github/**
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/server.ts
  - apps/runner/src/inbox/github.test.ts
  - apps/console/src/modules/github/**
  - apps/console/src/kit/pull.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/app.tsx
  - apps/console/src/modules/projects/context/workspace-context.tsx
  - apps/console/src/modules/chat/stores/providers.ts
created: 2026-10-03
updated: 2026-10-03
---

## What

Figma "18 · Pull requests": the list (panel on desktop; Open / Merged / Closed on phones), a pull
request as a document, and its changes as a reviewer reads them — with the backend each needs.

## Scope

**Left for later (agentic, by the human's choice):** "Ask Claude Code to apply" on a comment, the
agent's one-line summary over each file, the phone list's "Ask an agent to open a PR" composer.

## Resolution

**Runner** — lists take `state=open|merged|closed`; each pull request carries `agent` (its author,
or the signature lines of its description) and `thread` (the Grid thread whose worktree branch it
is: its title, role and agent). New: `GET /<n>/history` (the pull request's own commits, with
agents from co-author trailers and tags; while open, ahead/behind, the base's tip and the merge
base from the compare API), `GET /<n>/review` (viewer, review threads with path/line/side,
viewed files, latest verdicts — one GraphQL query), `POST /<n>/viewed`, `/rebase`
(`gh pr update-branch --rebase`), `/review` (verdict + line comments, sent as JSON through
`gh api --input`), and `merge` takes `deleteBranch`.

**Console** — each pull request has its own address (`/pulls/:slug/:number`, `/changes` after
it; old `?pr=` links redirect). Panel: Needs your review, then Open (glyph tinted by state, who
made it by agent logo, `#142 · checks running` / branch). Document: title, `#n` with branch → base
and who made it, facts (checks, "Approved by Codex", conflicts), What changed (the description),
Changes (files with counts), History (graph: base tip, the branch's commits, where it left, tags;
"main moved on by N commits. Rebase <branch>"), the review row with Review changes, and the
merge bar (Squash and merge, then delete the branch; confirmed in a dialog); ⋯ has fix with an
agent, ready/draft, other merge methods and close. Review changes: files tree with viewed
progress and comment counts, conversations, unified/split, hide whitespace (whitespace-only
pairs shown as unchanged), threads under their lines with suggested changes drawn as diffs, a
comment on any line kept as a draft on the device, and the review bar (Approve / Comment /
Request changes, Submit review); phones get Request changes / Approve. Kit: `pull.tsx`.

## Validation

- `bun run lint` 0, `bun run typecheck` 0, `vite build` OK.
- Console vitest 83 files / 531 tests (new: pull look ×4; pulls screen ×6 — panel groups, GitHub
  prompt, old link redirect, document with merge confirm, review with a line comment, fix sheet).
- Runner 327 pass (new: agent from signatures, history open and merged, review threads, review
  submission JSON).
- Chromium against this branch's runner (a copy of the runner database, automations and push
  removed) on the real repository: #161 as a document (Claude Code credited, 3 of 7 checks
  failing, history of its three commits), its changes in unified and split.
