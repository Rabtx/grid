---
id: str-project-notes
title: Project Notes: save snippets, transcripts, and thoughts into workspace notes
type: feature
from: human
to: ui-ux
priority: high
status: ready
assignee: ui-ux
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: []
branch: none
worktree: none
scope:
  - apps/console/src/modules/projects/**
  - apps/runner/src/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Implement a live Project Notes surface in Grid Console and back it with runner/database persistence.
When clicking "Add as note" on chat message bubbles or assistant responses, save the selected content
directly into the project's notes sheet.

## Why / Context

Chat bubbles and assistant responses now feature an "Add as note" action with a placeholder toast.
Turning this into a real feature allows users to collect critical agent recommendations, code snippets,
and architectural decisions into durable project notes.
