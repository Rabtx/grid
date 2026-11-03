---
id: str-grok-agent
title: Grok (xAI Grok Build CLI) as a built-in agent, set up from Settings → Agents
type: feature
from: human
to: backend
priority: normal
status: done
assignee: backend
reviewer: none
parent: 2026-11-03-agent-setup-in-settings.md
depends_on: []
branch: ccr-78b19f86-o8youq
worktree: /home/user/grid (cloud session; the session's designated branch)
scope: [apps/runner/src/agents/**, apps/runner/src/push/notifier.ts, apps/runner/src/folders/project-git.ts, apps/docs/content/docs/portable.mdx]
allowed_shared: []
created: 2026-11-03
updated: 2026-11-03
---

## What

Drive Grok the way t3code does (`packages/provider-grok`): ACP over `grok agent stdio`, sign-in
state from `grok models` (asked twice when it says logged out, since an expired token is refreshed
in the same run), `grok login --device-auth` and `grok update`, installed with
`https://x.ai/cli/install.sh` into `~/.grok/bin` (added to the runner's PATH).

## Scope

**In scope:** paths above. **Out of scope:** t3code's xAI ACP extensions (usage limits, skills),
permission-mode launch flags, `XAI_API_KEY` settings.

## Validation

- `bun test` (apps/runner), runner typecheck, pre-commit.

## Resolution

Done on `ccr-78b19f86-o8youq`. Not run live: installing Grok from this session is blocked; the
status reader follows t3code's matching of `grok models` output.
