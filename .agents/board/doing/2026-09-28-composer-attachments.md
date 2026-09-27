---
id: str-composer-attachments
title: Attachments in the chat composer — files and images to the agent
type: feature
from: human
to: backend
priority: high
status: doing
assignee: codex-backend
reviewer: human
parent: none
depends_on: []
branch: agent/backend/composer-attachments
worktree: ../grid-worktrees/agent/backend/composer-attachments
scope:
  - apps/console/src/modules/chat/**
  - apps/console/src/kit/**
  - apps/runner/src/chat/**
  - apps/runner/src/agents/**
  - apps/runner/src/server.ts
created: 2026-09-28
updated: 2026-09-28
---

## What

Roadmap A2. Paste, drag or pick files and images into the chat composer and send them to the
agent with the message.

## Why / Context

Screenshots of a bug and a file to read are the most common things people want to hand an agent.
See `.agents/plans/product-roadmap.md` (A2). The composer is `modules/chat/components/composer.tsx`
(new chats in `chat-screen.tsx`, threads in `conversation.tsx`); a message goes over the chat
socket (`{ t: "prompt", text }`) to `ChatHub.prompt` and each provider's `AgentSession.prompt`
(`apps/runner/src/agents/*.ts`).

## Proposal or Ask

- **Composer:** an attach button, paste (images from the clipboard) and drag-and-drop; up to 20
  files, 10 MB each; images as thumbnails, other files as chips (name, size), each removable;
  sending clears them. The kit already has an `Attachment` chip in `kit/message.tsx`.
- **Upload:** files go to the runner of the project's machine before the message
  (`POST /chat/sessions/:id/attachments`, or on the new-chat path) and are stored with the thread
  under the runner's data folder (not in the project), so a reload or another device still sees
  them; the prompt command carries their ids.
- **To the agent:** as each agent takes them: Claude (stream-json) and ACP agents get image
  content blocks for images; text files and anything else are saved where the agent can read them
  and referenced by absolute path in the message. Agents that cannot take images get the path.
- **Transcript:** the user's message shows its attachments (thumbnails open full size), replayed
  from the log like everything else (a new field on the `user` event).
- Phones: the attach button opens the system picker (camera/photos/files).

Definition of done: send a screenshot and a text file to Claude and to an ACP agent; the reply
shows it saw them; the message shows them after a reload and on a second device.

## Scope

**In scope:** the chat module (console), kit pieces for thumbnails/chips, the runner's chat hub,
store, routes and agent adapters.

**Out of scope:** attachments in board tasks or notes; image editing.

## Validation

- Runner tests: upload limits and types, storage per thread, ids resolved on prompt, each
  adapter's content blocks (fake agents, as the existing adapter tests do).
- Console tests: attach/paste/drop, remove, send, transcript replay with attachments.
- `bun run lint`, `bun run typecheck`, kit guard; a phone-width screenshot.

## Implementation plan

- Store bounded uploads under runner thread data, resolve ids before prompt, persist metadata.
- Extend provider prompts and replay; compose picker, previews and errors from kit components.
- Validate runner boundaries, adapter payloads, composer interactions and phone layout.
- Reviewer: human (independent review requested with PR). Preview ports: console 3118, runner 4118.

## Resolution

Implementation ready in [PR #130](https://github.com/shabirkhan-dev/grid/pull/130). Awaiting independent human review; this card stays in `doing` and the PR stays unmerged.

Changed:
- `apps/console/src/modules/chat/**`: picker, clipboard images, drop, limits, removable previews, uploads to the project's machine, and attachment replay on user messages.
- `apps/console/src/kit/**`: shared attachment and prompt recipes; no screen inline styling.
- `apps/runner/src/chat/**`, `apps/runner/src/agents/**`, `apps/runner/src/server.ts`: bounded authenticated upload/download, thread data storage and cleanup, persistent user events, and Claude/ACP image blocks with file paths for every attachment. Remote relay responses retain safe download headers.

Validation:
- `bun run format`: pass.
- `bun run lint`: pass (existing unrelated warnings only).
- `bun run typecheck`: pass.
- `bun run test`: pass: console 311, runner 169, web 31, API 28 passed / 20 skipped, plus other workspace suites. The console kit guard passed.
- `bun run architecture:check`: pass; naming passed.
- `bun --cwd=apps/console run build`: pass.
- Runner attachment tests: 5 passed (including remote runner upload, authorization, 10 MB stream boundary, replay from reopened store, and symlink rejection). Fake Claude and ACP adapter content-block tests: 3 passed.
- Live Claude and OpenCode ACP vision model: each read `ORBIT-472` from a test screenshot and `FILE-CHECK-819` from a text file and replied with both tokens. The ACP test used `opencode/mimo-v2.6-flash-free`; another vision model required an inactive subscription, so it was not used for the final proof.
- Chromium: attachment pick/send at 375 px; no horizontal overflow at 320, 375, 768, or 1280 px; no page errors. Image and file rendered after reload and in a fresh independent browser context. Local screenshots: `/tmp/composer-phone-375-final.png`, `/tmp/composer-replay-phone.png`, `/tmp/composer-second-device.png`. This validates a separate browser context, not a physical second device.

Contract impact:
- Runner `POST /chat/sessions/:id/attachments?name=…` and `GET /chat/sessions/:id/attachments/:attachmentId`; chat socket `prompt.attachments` and persistent `user.attachments`. Grid API (`/api/v1`) unchanged.

Review: human, pending independent review on PR #130.
Commit: `cf9a97b` (implementation); `52b0471` (claim).
