---
id: str-figma-notes-gaps
title: Notes fills the Figma 14 gaps — agent suggestions, images, which agents get a note
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: str-figma-notes
depends_on: [str-figma-notes]
branch: agent/web/figma-notes-gaps
worktree: none
scope:
  - packages/db/**
  - apps/api/src/modules/projects/**
  - apps/api/src/modules/profiles/routes.ts
  - apps/api/src/modules/workspaces/routes.ts
  - apps/api/src/app.ts
  - apps/runner/src/chat/**
  - apps/console/src/modules/projects/**
  - apps/console/src/kit/note.tsx
  - apps/console/src/lib/api-client.ts
created: 2026-10-03
updated: 2026-10-03
---

## What

The three parts of Figma "14 · Notes" that `str-figma-notes` left out because nothing backed
them: an agent's "suggests an addition" card, images in notes, and choosing which agents a
shared note goes to.

## Resolution

**DB / API** — migration 0011 adds `notes.agents` (provider ids; null for every agent).
PATCH and POST take `agents` (deduplicated, `[]` means every agent; not an edit).
`POST /projects/:slug/notes/:id/images` keeps a PNG, JPEG, WebP or GIF up to 5 MB under a random
name, served from `/uploads/notes/…` (like avatars: unguessable, not behind a token).

**Runner** — shared notes now carry `## title` and `note id: …` per note, and the brief tells the
agent how to suggest an addition: a ```` ```grid-note <id> ```` block ending its reply. When a
turn ends well, the runner keeps up to five suggestions per reply for notes the thread was given
(`note_suggestions` in the chat database). `GET/DELETE /chat/notes/:project/suggestions[/:id]`.

**Console** — the note shows each suggestion as Figma's card (agent, words, Dismiss, Add to
note — added as a new paragraph after anything waiting is saved). The format bar has Image
(also on the phone's bar), and pasting an image into the text uploads it; images render only
from Grid's own uploads, remote ones stay words. The "Shared with agents" chip is a menu: share
or stop, then Every agent or each agent on the machine (choosing one also shares the note); the
chip and the meta line show those agents' logos, and the meta says "Context for Claude Code in
grid". New threads (composer, fix a pull request) get only the notes meant for their agent.

**Left out** — nothing from the frames.

## Validation

- `bun run lint` 0, `bun run typecheck` 0, `vite build` OK.
- Console vitest 81 files / 524 tests (new: shared notes per agent with ids, note images).
- Runner 319 pass (new: grid-note parsing, a suggestion from an agent's reply kept and dropped
  per workspace).
- API contract 75 pass against this branch's API on :4090 (new: agents, image upload and serving).
