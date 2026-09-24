---
id: str-codex-adapter
title: Codex as a chat agent through its app-server protocol
type: feature
from: human
to: ui-ux
priority: high
status: open
assignee: claude
reviewer: human
parent: .agents/plans/next-foundations.md
depends_on: []
branch: agent/ui-ux/codex-adapter
worktree: ../grid-worktrees/agent/ui-ux/codex-adapter
scope:
  - apps/runner/src/agents/**
allowed_shared: []
created: 2026-09-25
updated: 2026-09-25
---

## What

Drive Codex (`codex app-server`, JSON-RPC over stdio) like the other agents: threads start and
resume in the project folder, replies stream, commands and file changes show as tool calls,
approvals work, and its models with effort levels appear in the pickers and Settings → Agents.

## Proposal

`agents/codex.ts`: `initialize` + `initialized`; `thread/start {cwd, model, approvalPolicy,
sandbox}` or `thread/resume {threadId, cwd}` from the stored resume token; `turn/start` with
`effort`; map `item/agentMessage/delta`, `item/reasoning/*Delta`, `item/started|completed`
(commandExecution, fileChange, mcpToolCall, webSearch, plan), `turn/completed`, `error`,
`thread/tokenUsage/updated`; answer `item/commandExecution/requestApproval` and
`item/fileChange/requestApproval`; `turn/interrupt` to cancel. Modes: Supervised, Auto-accept
edits, Full access. Catalog from `model/list`.

## Validation

Runner tests with a fake app-server; a real turn in a temp folder.

## Resolution
