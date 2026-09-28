---
id: str-composer-plus
title: Composer "+" menu and better attachments
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: human
parent: none
depends_on: []
branch: agent/web/composer-plus
worktree: ../grid-worktrees/composer-plus
scope:
  - apps/console/src/modules/chat/components/composer.tsx
  - apps/console/src/modules/chat/components/composer.test.tsx
  - apps/console/src/modules/chat/components/message-attachments.tsx
  - apps/console/src/modules/chat/components/attachment-*.tsx
  - apps/console/src/modules/chat/lib/attachments*.ts
  - apps/console/src/modules/chat/services/chat.service.ts
  - apps/console/src/kit/** (new or changed primitives, each shown in /design)
  - apps/runner/src/chat/attachments.ts
  - apps/runner/src/chat/routes.ts
allowed_shared: []
created: 2026-09-28
updated: 2026-09-28
---

## What

Replace the composer's lone paperclip with one clean **+** button at the start of the tool row
(then the model and mode chips, then mic and send on the right), opening a small menu:

- **Add files or photos** — the file picker.
- **Take a photo** — phones and tablets only (`capture` on the file input).
- **Add from project** — pick a file from the thread's project; it's added as a reference chip
  (its path goes to the agent, nothing is uploaded).
- **Mention a file** — inserts `@` and opens the existing mention menu.
- **Commands** — inserts `/` and opens the existing slash menu.

Then make attachments feel finished: a drop zone over the whole conversation (not only the text
box), paste of any file (not just images), image thumbnails in the chips with a larger preview on
click or tap, per-file upload progress, a per-file error with retry, file size on each chip, and
remove on each chip.

## Why / Context

The reference screenshots in `~/Projects/grid-references/2026-09-26/` (`20-composer-plus-menu.jpg`,
`01-home-composer.jpg`) show the pattern the person wants: one quiet + that holds the extras,
keeping the composer clean. Attachments landed in `str-composer-attachments` (runner storage,
limits, relay), but the console side is bare: no progress, no previews, drag only onto the box.

## Proposal or Ask

- A kit `Menu`/popover primitive if one doesn't exist (check `apps/console/src/kit` first), with a
  bottom sheet on phones and a popover on desktop; keyboard (arrows, Enter, Escape), focus return
  to the + button, `menu`/`menuitem` roles. Show it on `/design`.
- The + button replaces `AttachIcon`'s button in `composer.tsx` `tools`; the tool row order is
  + · model · mode … mic · send. 44 px touch targets on phones.
- Uploads go through `chatService.upload` with progress (XMLHttpRequest `upload.onprogress`, or
  streaming the body; pick what works through the `/env/<id>/` relay) and cancel on remove.
  Uploading starts when a file is added, so Send is instant; Send waits for, or is disabled until,
  pending uploads finish, and says so.
- "Add from project": reuse the files browser's data source (the runner's project listing) in a
  searchable picker; the chip shows the relative path and sends it like an `@` mention.
- Respect the runner's limits (10 MB per file, 20 per message, 200 files and 500 MB per thread),
  showing the runner's own error message on the chip.
- Built only from kit primitives; no inline styling; mobile first; quiet motion.

**Definition of done:** on a phone and a desktop, + opens the menu and each item works; dropping
anywhere on the conversation attaches; pasting a PDF attaches it; an image chip shows a thumbnail
and opens a preview; a slow upload shows progress; a failed one shows why and retries; remove
cancels an upload in progress; everything still sends correctly through a paired environment.

## Scope

**In scope:** the paths above.

**Out of scope:** agent commands in the `/` menu (`str-agent-commands`), web search or other
tools in the menu (later), changing runner storage limits.

## Validation

- `bun run format`:
```
$ oxfmt --write . && bun run scripts:format && (cd packages/logger/rust && cargo fmt || true)
Finished in 175ms on 683 files using 4 threads.
$ shfmt -i 4 -w scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh || true
```

- `bun run lint`:
```
$ bun run --filter '*' lint && bun run scripts:lint
launcher lint: Exited with code 0
runner lint: Exited with code 0
@grid/db lint: Exited with code 0
@grid/logger lint: Exited with code 0
api lint: Exited with code 0
docs lint: Exited with code 0
console lint: Exited with code 0
@grid/ui lint: Exited with code 0
web lint: Exited with code 0
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
```

- `bun run typecheck`:
```
$ bun run --filter '*' typecheck
docs typecheck: [MDX] generated files in 139.00343499999985ms
@grid/logger typecheck: Exited with code 0
launcher typecheck: Exited with code 0
docs typecheck: Generating route types...
runner typecheck: Exited with code 0
docs typecheck: [MDX] generated files in 75.07655800000066ms
docs typecheck: ✓ Types generated successfully
@grid/db typecheck: Exited with code 0
@grid/ui typecheck: Exited with code 0
console typecheck: Exited with code 0
docs typecheck: Exited with code 0
api typecheck: Exited with code 0
web typecheck: Exited with code 0
```

- `bun run architecture:check`:
```
$ bash scripts/architecture/check-boundaries.sh
Running architecture boundary checks...
Architecture checks passed.
Running kebab-case naming checks...
[naming] OK (696 path(s) checked)
```

- `cd apps/console && bunx vitest run`:
```
 RUN  v5.0.1 /home/ghost/Projects/grid-worktrees/composer-plus/apps/console

 Test Files  64 passed (64)
      Tests  423 passed (423)
   Start at  06:05:02
   Duration  33.43s (tests 58%, environment 19%, transform 11%, import 10%, worker 1%)
```

- `cd apps/runner && bun test`:
```
bun test v1.4.2 (744846f84)

 248 pass
 0 fail
 927 expect() calls
Ran 248 tests across 34 files. [23.75s]
```

- Tests added and verified:
  - Menu keyboard and focus management (`apps/console/src/kit/menu.test.tsx`): ArrowDown, ArrowUp, Home, End wrapping, Escape, and focus return to trigger.
  - Composer tests (`apps/console/src/modules/chat/components/composer.test.tsx`, 31 tests):
    - `+` menu options: "Add files or photos", "Take a photo" (touch/camera), "Add from project", "Mention a file", "Commands".
    - Drop anywhere on conversation / window.
    - Paste of any non-image file (e.g. PDF).
    - Image thumbnail and full preview dialog on click.
    - Real-time upload progress percentage display.
    - Upload cancellation on file removal.
    - Per-file error state with retry.
    - Send button disabled with "Uploading attachments…" while uploads are pending.
    - Project file reference chip adding and `@path` mention inclusion.
    - Runner limits enforcement (10 MB per file, 20 files per message).
    - Edge cases: duplicate files, message with only attachments, empty draft.

- Screenshots captured at 375 px and 1280 px (light and dark, menu open and with chips):
  - `.agents/board/screenshots/composer-plus/composer-375-light-menu-open.png`
  - `.agents/board/screenshots/composer-plus/composer-375-light-chips.png`
  - `.agents/board/screenshots/composer-plus/composer-375-dark-menu-open.png`
  - `.agents/board/screenshots/composer-plus/composer-375-dark-chips.png`
  - `.agents/board/screenshots/composer-plus/composer-1280-light-menu-open.png`
  - `.agents/board/screenshots/composer-plus/composer-1280-light-chips.png`
  - `.agents/board/screenshots/composer-plus/composer-1280-dark-menu-open.png`
  - `.agents/board/screenshots/composer-plus/composer-1280-dark-chips.png`

## Before you open the pull request (self-review)

These were found in the last reviews; check each and say so here.

- [x] Stale or out-of-order responses can't overwrite newer state (request ids).
- [x] Every failure tells the person why; no silent returns.
- [x] Edge cases tested: many files, a huge file, the same file twice, removing mid-upload, going
      offline mid-upload, a message with only files.
- [x] Touch and desktop both behave natively; nothing relies on hover alone.
- [x] No Solid 1 APIs; kit-guard clean; no new dependencies.
- [x] Tested only against your own servers and database copies — never the live API or database.
- [x] Never kill processes you did not start.

## Resolution


Merged to `main` as #139; the board was brought up to date on 2026-09-28.
Replaced the chat composer's paperclip button with a clean **+** `Menu` button and implemented complete attachment capabilities:
1. **+ Button & Menu**:
   - Integrated kit `Menu` with `menuTrigger({ shape: "icon" })` providing desktop popover and mobile bottom sheet presentation with full keyboard navigation (arrows, home, end, escape) and focus restoration to the trigger button.
   - Options provided: "Add files or photos" (triggers file picker), "Take a photo" (touch/camera input with `capture="environment"`), "Add from project" (searchable project picker dialog), "Mention a file" (inserts `@`), and "Commands" (inserts `/`).
2. **Finished Attachments UX**:
   - Window/conversation-level drop zone with visual overlay ("Drop files to attach") allowing drops anywhere on the conversation.
   - Clipboard paste handler accepting any file type (not just images).
   - Image thumbnails in chips with full image preview dialog on click (`AttachmentPreviewDialog`).
   - Per-file upload progress tracking (`chatService.uploadOne` with `XMLHttpRequest` progress reporting).
   - Per-file error state with instant Retry action.
   - Removal cancels active upload and revokes object URLs.
   - Send button disabled while uploads are pending ("Uploading attachments…") or when upload errors exist.
   - Project file references added as non-uploaded reference chips and automatically appended as `@path` tokens on send.
3. **Verification**:
   - 100% test pass rate across console (423 tests across 64 test files) and runner (248 tests across 34 files).
   - Zero kit-guard violations, zero typecheck errors, clean lint and formatting.
   - Captured 8 verified screenshots at 375 px and 1280 px (light and dark, menu open and chips).

