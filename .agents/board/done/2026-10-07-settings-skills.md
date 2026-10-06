---
id: grid-settings-skills
title: add a skills page to settings to add, enable and share agent skills
type: feature
from: human
to: backend
priority: normal
status: done
assignee: backend agent, finished by claude (pm)
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

The backend agent wrote the store, routes, imports and screen, then stopped without committing
(nothing changed in its worktree for about 45 minutes; its work is still uncommitted there on
`agent/backend/settings-skills`). PM brought that work into the integration branch
`agent/pm/integration` on 2026-10-07, reviewed it and finished it.

**Built:**
- A runner skill store (`apps/runner/src/skills/`): one folder per skill (SKILL.md, metadata and
  files), with strict names, relative paths only, no `..`, `.git` or symbolic links, size limits
  (64 KB per skill, 512 KB and 100 skills per workspace), and every path checked against the store.
- Routes to list, add, update, toggle and remove skills, scoped to the workspace. A project skill
  overrides a workspace skill of the same name.
- Three ways to add a skill. Write it in place. Upload a folder or ZIP, read in memory and never
  extracted, with zip-bomb limits. Or give a public GitHub URL: Grid downloads the archive through
  the API, checks redirects, runs no git commands and executes nothing from the repository.
- Settings → Agents → Skills, built from kit primitives, with loading, empty and error states.

**Changed in PM review:**
- **Delivery.** The agent's version JSON-dumped every enabled skill's full contents (up to 512 KB)
  into every message. Agents now get a short index instead: each skill's name, description and
  path to its SKILL.md. They read a skill when it applies (progressive disclosure, as agents load
  skills natively). The index goes to each agent process once and again only when it changes.
  When skills are switched off, the agent is told. This works the same for every provider.
  Covered in `hub.test.ts`. The store tests read the indexed files back from disk.
- **Device-native rows.** The ⋯ now shows only on hover or focus with a pointer, is not drawn on
  touch, and right-click or a long press opens the same menu. The "Enabled" badge, which repeated
  the switch, is gone; only "Off" shows. The editor tabs use the kit's `Segmented`, and the ZIP
  picker uses a kit button style.
- Settings sidebar entry with its own glyph. Delivery copy updated. Lint fixes.

**Validation:** runner 475 / 475 pass (35 hub and skills tests). Console 122 files / 696 tests
pass. Lint (exit 0), typecheck, architecture and naming checks pass. In the browser, an
integration console (:3023) ran against an isolated integration runner (:4199, its own data folder,
not the live runner). Checked: empty state, writing a skill, the ⋯ hidden at rest, right-click
opening Edit and Remove, switching the skill off (the Off badge shows), and removing it with
confirmation back to the empty state. No paid agent turn was run, so the index reaching a real
agent is covered by the hub test with a fake provider, not by a live turn.
