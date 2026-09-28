---
id: str-composer-plus
title: Composer "+" menu and better attachments
type: feature
from: human
to: web
priority: high
status: open
assignee: none
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

- `bun run format`, `bun run lint`, `bun run typecheck`, `bun run architecture:check`,
  `cd apps/console && bunx vitest run`, and `cd apps/runner && bun test` if the runner changed —
  paste the real output here.
- Tests: menu keyboard and focus, phone vs desktop presentation, drop on conversation, paste of a
  non-image, progress and cancel, error and retry, the project-file reference, Send while an
  upload is pending, the limits.
- Screenshots at 375 px and 1280 px, light and dark, menu open and with chips.

## Before you open the pull request (self-review)

These were found in the last reviews; check each and say so here.

- [ ] Stale or out-of-order responses can't overwrite newer state (request ids).
- [ ] Every failure tells the person why; no silent returns.
- [ ] Edge cases tested: many files, a huge file, the same file twice, removing mid-upload, going
      offline mid-upload, a message with only files.
- [ ] Touch and desktop both behave natively; nothing relies on hover alone.
- [ ] No Solid 1 APIs; kit-guard clean; no new dependencies.
- [ ] Tested only against your own servers and database copies — never the live API or database.
- [ ] Never kill processes you did not start.

## Resolution

