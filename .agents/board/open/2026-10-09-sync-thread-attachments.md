---
id: grid-sync-thread-attachments
title: keep thread attachments (images, files) beyond the machine
type: feature
from: backend
to: backend
priority: low
status: open
assignee: none
reviewer: human
parent: grid-thread-sync
depends_on: [grid-thread-sync]
branch: none
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

