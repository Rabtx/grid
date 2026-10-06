---
id: grid-settings-skills
title: add a skills page to settings to add, enable and share agent skills
type: feature
from: human
to: backend
priority: normal
status: open
assignee: none
reviewer: pm
parent: none
depends_on: []
branch: agent/backend/settings-skills
worktree: /home/ghost/Projects/grid-worktrees/agent/backend/settings-skills
scope: [apps/runner/src/skills/**, apps/console/src/modules/skills/**]
allowed_shared: [apps/runner/src/server.ts, apps/runner/src/main.ts, apps/runner/src/agents/**, apps/console/src/modules/settings/components/settings-sidebar.tsx, apps/console/src/app.tsx]
created: 2026-10-07
updated: 2026-10-07
---

## What

A new **Skills** page in Settings (under Agents) where people manage the skills their agents can use. A skill is a folder with a `SKILL.md` (frontmatter `name` and `description`, plus instructions and optional files). People can:

- see installed skills, with name, description, where each comes from, and which agents get it
- add a skill: from a Git repository URL or folder, by uploading a folder or zip, or by writing one in place
- turn a skill on or off, edit it and remove it
- choose whether a skill applies to the whole workspace or one project

## Why / Context

The owner wants skills managed from Grid, the way other agent workbenches offer them. The owner will point you to the reference products to study. Describe what you build in Grid's own terms, and don't name other products in code, comments, cards or commits. Grid is provider-agnostic, so skills must reach every agent Grid runs (Claude Code, Codex, OpenCode, Antigravity and so on) in whatever form each one reads skills, from one Grid-owned store. Don't tie the feature to one provider.

## Proposal or Ask

Definition of done:

- The runner has a skill store (`apps/runner/src/skills/`) with validation: frontmatter is required, names are kebab-case, size is limited and paths can't escape the store. It has routes to list, add, update, toggle and remove skills.
- Enabled skills reach the agents of chats in their scope. Show this per provider with a test using the fake providers. Where a provider can't take skills, say so in the UI rather than pretending.
- Settings → Agents → Skills is built from kit primitives and follows the device-native rules: row actions on hover or long press, a bottom sheet on phones, a centred dialog on desktop, and loading, empty and error states.
- Adding from a Git URL never runs code from the repository.

## Scope

**In scope:** the paths in `scope`. In `allowed_shared`, change only what's needed: register the skills routes, add one Skills entry to the settings sidebar, add the route, and hand skills to agents. The sidebar card (`2026-10-07-sidebar-settings-cleanup.md`) is changing `settings-sidebar.tsx` at the same time, so keep your edit to one entry and expect to rebase.

**Out of scope:** a public skills marketplace, and paid features.

## Validation

- Runner tests for store validation, path-escape attempts and delivery to agents. Console tests for the page's states and actions.
- Runner and console suites, root lint, format, typecheck and architecture checks.
- Screenshots at phone and desktop sizes, light and dark. Verify against a runner on a spare port with its own data directory, never the live one. Open a PR, record evidence here, and PM verifies before merge.

## Resolution

