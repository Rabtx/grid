---
id: str-composer-attachments
title: Attachments in the chat composer — files and images to the agent
type: feature
from: human
to: backend
priority: high
status: open
assignee: none
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

## Resolution
