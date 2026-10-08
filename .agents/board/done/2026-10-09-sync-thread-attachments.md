---
id: grid-sync-thread-attachments
title: keep thread attachments (images, files) beyond the machine
type: feature
from: backend
to: backend
priority: low
status: done
assignee: claude
reviewer: human
parent: grid-thread-sync
depends_on: [grid-thread-sync]
branch: agent/backend/sync-thread-attachments
worktree: none
scope: [apps/runner/src/sync/**, apps/api/src/modules/runner/**]
allowed_shared: []
created: 2026-10-09
updated: 2026-10-09
---

## What

`grid-thread-sync` sends thread events, not the files attached to messages (the runner's
`attachments` table and folder). A restored thread shows its messages, but an attached image is
missing.

## Proposal or Ask

Send attachments once each (content-addressed) to the API's uploads, and restore them with the
thread. Done when a restored thread's attached image opens on the new machine.

## Validation

- Sync and restore tests with an attachment.

## Resolution

Done by claude.

- `thread_attachments` table (migration `0015_thread_attachments`): name, type, size and the file as
  base64. API: `PUT /runner/threads/<id>/attachments/<id>` (only from the machine holding the
  thread, else 409), `GET …/attachments` (list) and `GET …/attachments/<id>` (with contents).
- `ThreadSync` sends each attached file once, after its thread (`sync_attachments`); a file gone
  from the disk or refused is not retried.
- Environments: the export lists each thread's attachment ids and serves the files; the home runner
  fetches only new ones and sends them as the environment's machine (`env_sync_attachments`).
- Restore writes each restored thread's files back (`ChatStore.addAttachment`).

Validation: API route test (holder only, idempotent, list, contents, 404); runner tests (sent once,
forwarded from an environment as its machine, restored with the thread); runner suite 500 pass.
End to end on a scratch Grid: a file uploaded through the runner's own attachment route reached
the API; a restore into a separate fresh runner database wrote it back byte-identical.

