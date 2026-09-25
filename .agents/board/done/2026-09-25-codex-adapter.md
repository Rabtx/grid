---
id: str-codex-adapter
title: Codex as a chat agent through its app-server protocol
type: feature
from: human
to: ui-ux
priority: high
status: done
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

Landed in #56. `apps/runner/src/agents/codex.ts`, registered as `codex` (found on PATH):
handshake; `thread/start` or `thread/resume` (stored thread id) with the project folder as `cwd`;
`turn/start` with model, effort, approval policy and a sandbox rooted in the folder; streamed
replies and reasoning; commands (read/search/execute from Codex's command actions), file changes,
MCP calls and web searches as tool calls; plan and token usage; command and file-change approvals
(Allow, Allow for this chat, Deny); `turn/interrupt` to stop; only the final error (Codex's own
retries are skipped). Modes: Supervised, Auto-accept edits, Full access. Models from `model/list`
with effort levels (`ultra` added to the effort names).

Validation: `codex.test.ts` (5 tests, fake app-server), runner suite 48 pass; a real smoke run
created and, after a simulated restart, edited a file in the project folder. From a
network-sandboxed session `chatgpt.com` is unreachable, so the runner must run outside one.

