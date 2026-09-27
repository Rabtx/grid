---
id: str-files-editor
title: Edit files in Files — a quick, safe code editor
type: feature
from: human
to: web
priority: high
status: doing
assignee: web
reviewer: human
parent: none
depends_on: []
branch: agent/web/files-editor
worktree: ../grid-worktrees/agent/web/files-editor
scope:
  - apps/console/src/modules/projects/components/files-screen.tsx
  - apps/console/src/modules/projects/components/**
  - apps/console/src/modules/projects/services/files.service.ts
  - apps/console/src/lib/runner-client.ts
  - apps/console/src/kit/**
  - apps/console/src/styles/**
  - apps/runner/src/folders/**
  - apps/runner/src/server.test.ts
  - apps/console/package.json
  - .agents/board/doing/2026-09-28-files-editor.md
  - bun.lock
allowed_shared:
  - bun.lock
  - apps/console/package.json

Notes:
  - ports: validation used this worktree's own runner on 4111 and console on 3012 (3001/3011/4100
    were already taken by the dev stack); the worktree is `../grid-worktrees/agent/web/files-editor`.
  - two paths were added to `scope` while implementing, both recorded here rather than quietly
    taken: `apps/runner/src/server.test.ts` (the write route is proved over real HTTP there, next to
    the other folder-route tests) and the `runner-client.ts` note below.
  - `apps/console/src/lib/runner-client.ts` is in scope although the card did not list it: a save
    has to tell a stale refusal (409) from any other, and `runnerCall` was throwing the status
    away. The change is additive — a `RunnerError` that extends `Error` and carries the status —
    so every existing caller behaves exactly as before.
  - `apps/console/src/kit/message.tsx` (`DiffCard`) is in scope: its rows read a prop outside a
    tracking scope, which Solid 2 reports in development every time any diff renders. Fixed with
    a `keyed` `<Show>`, so chat and pull requests are quieter too.
  - still open, for whoever owns the environments module: `machine-picker.tsx:9` calls
    `environments.load()` from an effect callback, which reads signals it does not track
    (4 development warnings per re-read).
  - `apps/docs/content/docs/backend-api.mdx` is deliberately NOT in scope: that page documents the
    Grid API (`apps/api`, Hono), and the runner's own routes are not documented anywhere in the
    docs app today. The new `PUT /projects/files/:slug/content` is recorded on this card and in
    `apps/runner/src/folders/routes.ts` instead. If the runner's HTTP surface should be
    documented, that is a separate card for the docs owner.
created: 2026-09-28
updated: 2026-09-28
---

## What

Roadmap A4. The Files page reads files today (list and reader, `files-screen.tsx`, runner
`GET /projects/files/:slug/content`). Make it a quick way to edit them: open a file, edit, save.

## Why / Context

People want small fixes without opening an IDE or asking an agent. See
`.agents/plans/product-roadmap.md` (A4). A local reference app with a good editor is at
`~/Projects/monocode` (read its file editor for ideas only; never copy its code or name it in
this repo).

## Proposal or Ask

- **Editor:** CodeMirror 6, lazy-loaded only when a file is opened for editing (keep the reader
  for viewing): syntax colouring by file type, search (Ctrl/⌘+F), line numbers, Ctrl/⌘+S to save,
  a dirty dot on the file's row and tab, undo/redo. Theme it from the kit's tokens (light and dark).
- **Save safely:** a runner write route with the same folder containment as reading
  (`folders/project-files.ts`): `PUT /projects/files/:slug/content` with `{ path, text, base }`,
  where `base` is the hash of the text as opened; the runner refuses (409) when the file changed
  on disk since, and the console offers "Reload" or "Overwrite". Refuse binary and too-large files.
- **Diff:** a "Changes" toggle showing the edit against the file as opened (the kit's `DiffCard`).
- **Phones:** files open read-only with an Edit button; editing works but is not the default.
- **New file** already exists; after creating one, open it in the editor.
- Leaving with unsaved changes asks first.

Definition of done: edit and save a file from the browser on desktop and phone, a stale save is
refused with a clear choice, and nothing outside the project folder can be written.

## Scope

**In scope:** the Files screen and its components, the files service, kit pieces the editor
needs, the runner's project-files and folder routes, CodeMirror packages.

**Out of scope:** "ask the agent about this selection" (later), git staging/commits, the chat.

## Validation

- Runner tests for the write route: containment (`..`, absolute paths, symlinks out), the stale
  hash refusal, binary and size limits.
- Console tests: open → edit → save, dirty state, stale-save choice, leave-with-changes prompt.
- `bun run lint`, `bun run typecheck`, `bun run architecture:check`, the kit guard
  (`src/styles/kit-guard.test.ts`).
- A screenshot on desktop and at phone width.

## Resolution

## Resolution

Implemented. The Files page reads a file as before and edits it on request, everywhere: read-only
is the default on phones and desktops, one **Edit** button opens the editor, and CodeMirror 6 is
fetched only then (its chunk is `code-editor-view-*.js`, 328 kB / 106 kB gzipped, beside the
terminal's own). A file created through the page opens straight in the editor.

- **Kit:** `CodeEditor` (`kit/code-editor.tsx`, the lazy boundary) over `kit/code-editor-view.tsx`
  (line numbers, undo/redo, Ctrl/⌘+F search, Ctrl/⌘+S save, line wrapping, syntax colouring for
  ts/js/json/md/html/css/py/rs/yaml/sql — each language a chunk of its own), themed from kit
  tokens so it follows Appearance in light and dark. `diffLines` (`kit/diff.ts`) makes the Changes
  view for the kit's `DiffCard`. `FolderTree` gained a `mark` slot for the dirty dot on a row.
- **Console:** `file-editor.tsx` holds the draft, the save and the refusals; `files-screen.tsx`
  wires the pane, the tree's dirty dot and the new file. A refusal is a question — **Reload from
  disk** or **Overwrite** — and an overwrite re-reads the file first, so it is still checked
  against a real version rather than forced. Leaving with unsaved changes asks, and so does
  closing the tab.
- **Runner:** `PUT /projects/files/:slug/content` with `{ path, text, base }`, where `base` is the
  hash of the text as it was read (now returned by `GET …/content`). It writes only through the
  same containment as reading (lexical `..`/absolute/backslash refusal, `realpath` of both ends,
  `within` the project root, so a symlink out is refused), only onto that exact version (409
  otherwise), never binary, never over the 512 KB read limit, and it renames a temporary file
  over the target so a reader never sees half a file.

Decisions worth knowing:

- Editing is opt-in everywhere rather than automatic on desktop. One behaviour, no width
  branching, and it is what keeps the editor's bundle out of a read-only visit.
- "Unsaved" and the Changes diff are measured against the text as it is **last known on disk**,
  not as it was opened: after a save there is nothing left to show as changed.
- `apps/docs/content/docs/backend-api.mdx` was not touched — see the note in the frontmatter.

### Changed

- runner: `folders/project-files.ts` (hash, `writeProjectFile`), `folders/routes.ts` (the `PUT`),
  `folders/project-files.test.ts`, `server.test.ts`.
- console: `kit/code-editor.tsx`, `kit/code-editor-view.tsx`, `kit/diff.ts`, `kit/diff.test.ts`,
  `kit/tree.tsx`, `kit/index.ts`, `kit/message.tsx`, `lib/runner-client.ts`,
  `modules/projects/services/files.service.ts`, `modules/projects/components/file-editor.tsx`,
  `modules/projects/components/files-screen.tsx` (+ test), `package.json`, `bun.lock`.
- No other agent's paths were touched.

### Validation

- `bun run lint` — clean (only the pre-existing `login-form.tsx` warning).
- `bun run format` — clean.
- `bun run typecheck` — every workspace exits 0.
- `bun --cwd=apps/console run test` — 319 pass, 0 fail (53 files; 7 new editor tests, 6 new diff
  tests, plus the existing files-screen tests). The kit guard (`src/styles/kit-guard.test.ts`) is
  among them and passes.
- `bun --cwd=apps/runner run test` — 166 pass, 0 fail (22 files; 4 new write tests covering
  save-onto-read-version, the stale refusal, traversal/absolute/symlink/missing/folder, binary
  text, the size limit, and no temporary file left behind; 1 new route test over real HTTP).
- `bun run architecture:check` — boundaries and kebab-case naming pass.
- `bun --cwd=apps/console run build` — builds; the editor is its own chunk.
- Browser (this worktree's runner on 4111 and console on 3012, demo account, a scratch project
  folder): opened a file read-only, pressed Edit, typed, saw the dirty dot on the tree row and the
  Changes view, saved (the file on disk changed), then had the file written from outside and saved
  again — the conflict dialog appeared, **Reload from disk** took what was there, and the next
  save went through. Repeated at 375 px: read-only with the Edit button, the editor fills the
  width with no horizontal overflow, and the leave-with-changes prompt is a bottom sheet.
- The console's own dev warnings were chased down and the new surfaces add none. Two pre-existing
  sources were found on the way: `DiffCard`'s rows (fixed here, since a diff renders in the new
  Changes view) and `machine-picker.tsx:9` reading `environments.load()` inside an effect, which
  is outside this card and still warns (4) when the environments store re-reads.

### Contract impact

- New runner route `PUT /projects/files/:slug/content` (body `{ path, text, base }`, answers
  `data: ProjectFileContent`; 400 for a missing field, 403 outside the project, 404 missing, 409 a
  stale version, 413 too large) and one added field, `hash`, on `GET …/content`. The runner's HTTP
  surface has no home in the docs app; the Grid API page is untouched on purpose.

### Review

- human — requested on the PR for `agent/web/files-editor`; not merged, not self-approved.

### Commit

- `b1d61ff` — feat(files): edit project files in the browser, saved only onto the version read
  (this card's update of the commit field is the only commit after it).
