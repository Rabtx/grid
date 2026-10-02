---
id: str-figma-notes
title: Notes match the Figma 14 Notes frames, shared notes reach agents
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-files]
branch: agent/web/figma-notes
worktree: none
scope:
  - packages/db/src/schema/notes.schema.ts
  - packages/db/migrations/**
  - apps/api/src/modules/projects/**
  - apps/runner/src/chat/**
  - apps/console/src/modules/projects/**
  - apps/console/src/modules/shell/**
  - apps/console/src/kit/**
created: 2026-10-02
updated: 2026-10-02
---

## What

Notes rebuilt to Figma "14 · Notes" (desktop and phone, light and dark), end to end: notes can
be pinned, given a glyph, and shared with agents, and a shared note goes with the first message
of every new thread in the project ("Context for agents in <project>").

## Scope

**Out of scope (nothing backs them yet):** the agent's "suggests an addition" card, images in
notes, which agent reads a note (shared notes go to every agent). The editor is Markdown in place
(press the words to write; the format bar edits the Markdown), not a rich-text editor.

## Resolution

**DB / API** — migration 0010: `pinned`, `shared`, `icon` (fixed set), `created_by`,
`updated_by`. Notes come with `author`/`editor` names (display name, else username). PATCH takes
`body`, `pinned`, `shared`, `icon`; only a new text moves "edited" and its editor.

**Runner** — a thread can start with the project's shared notes (`notes`, ≤64k characters);
they go with the first message that gets through (after a role's brief), like the role brief,
and are kept per thread. Thread lists and replies don't carry the text, only `sharedNotes`.

**Console** — the panel lists notes (Pinned, Recent; glyph, title, time, preview or checklist
progress, a mark when shared; search; New note in the panel header). The note is a document: an
editable title, who changed it and when, the format bar (Text style, bold, italic, list,
checklist, code, link, "@" to name a project file, Ask), its text drawn from Markdown (headings,
tasks you tick in place, files as chips that open in Files, code highlighted, safe links only),
and the thread it came from. The top bar has Shared with agents, pin, download as Markdown, and a
menu (glyph, pin, share, copy, delete). On phones: Notes home with search, pinned cards, a list
and an "Ask about your notes" dock; the note with back and ⋯ in the header and the format bar at
the foot. Edits save themselves (debounced, one save at a time, note by note). Each note has its
own path (`/notes/:slug/:note`); old `?note=` links still open it. New threads (composer, fix a
PR) start with the shared notes. Shell gains `panelActions`, `heading`, `leading`, `trailing`
slots. Kit: note.tsx (NoteGlyph, rows, card, search, ask dock, format bar, meta, shared chip,
NoteBlocks, mentions, thread chip, edit button).

**Validation** — console typecheck clean, lint 0 errors (2 old warnings), 80 files / 515 tests
(new: note-doc, note-edit, notes store, notes screen ×6), build OK. API tsc and lint clean,
contract 73 pass (new: pin/share/icon and author). Runner tsc clean, chat 60 pass (new: shared
notes brief). Migration applied to Postgres. Chromium at 1440×900 and 390×844, light and dark;
checked in the browser: tick saves, typing saves, new note gets its address, "@" picker, and a
new thread's POST carries the shared notes, stored on the session.

**Review** — independent reviewer, 9 findings, all fixed: a created note could not be reopened;
switching notes mid-save dropped edits (now a per-note queue); a late PATCH answer could put back
an old text (per-note order, answers merge only what changed); ticking could hit a look-alike in
code (now by the box's position in the text); thread lists carried every thread's notes; empty
or over-long notes failed silently (now said, not sent; retries with backoff; saves on leaving the
page); old `?note=` links; no keyboard way into writing (Edit the text button); starting a thread
waited on the notes (2.5s cap, and says when some were too long).
