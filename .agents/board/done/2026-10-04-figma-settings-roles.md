---
id: str-figma-settings-roles
title: Settings match the Figma 24 Roles frames — viewer, custom roles and enforced permissions
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: [str-figma-settings-agents]
branch: agent/web/figma-settings-roles
worktree: none
scope:
  - packages/db/src/schema/workspaces.schema.ts
  - packages/db/src/roles*.ts
  - packages/db/package.json
  - packages/db/migrations/**
  - apps/api/src/modules/workspaces/**
  - apps/api/src/modules/projects/service.ts
  - apps/api/test/contract/workspaces.test.ts
  - apps/runner/src/**
  - apps/console/src/modules/settings/**
  - apps/console/src/modules/workspaces/**
  - apps/console/src/modules/environments/components/machines-screen.tsx
  - apps/console/src/modules/chat/components/chat-screen.tsx
  - apps/console/src/kit/settings.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/app.tsx
created: 2026-10-04
updated: 2026-10-04
---

## What

Figma "24 · Settings → Roles", desktop and phone: the workspace's roles with how many people hold
each, and a table of what each role may do — with the backend that makes those permissions real.

## Scope

Seven permissions: start agents, approve agent commands, merge pull requests, run on production,
manage machines, manage integrations, invite people. Billing and deleting the workspace stay the
owner's alone. **Run on production** is stored and shown; nothing deploys yet, so nothing reads
it. **Manage integrations** today covers connecting GitHub; the Connectors card adds the rest.

## Resolution

**Database** — `0013_roles`: `viewer` joins `workspace_role`; members and invites get
`custom_role`. Settings carry `rolePermissions` (per built-in role, over the defaults) and
`customRoles` (id, name, description, permissions). `@grid/db/roles`: `ROLE_DEFAULTS`, `mayDo`.

**API** — viewers read projects, tasks and notes and change none of them; inviting (create,
resend, list, revoke) is the `invite` permission, up to your own rank; members can be made viewers
or given a custom role (ranks as member); removing a custom role puts its holders and invites back
on member; role permissions merge per role.

**Runner** — `permissions.ts` (`may`, `readOnly`) on the token check's role and custom role:
starting threads and automations needs `startAgents`; writing to an agent needs `startAgents`,
answering it `approveCommands` (also from a locked phone's notification); merging needs
`mergePulls`; this machine, other machines and Codespaces need `machines`; connecting GitHub needs
`integrations`. Viewers change nothing over HTTP (their own settings, notifications and voice
aside) and get no terminal. "Admins only" agents now mean owner or admin, not "not a member".

**Console** — Roles: the list with counts and Figma's descriptions; the table, each cell a switch
for owners and admins (owner's column fixed, billing row fixed); New role (name, line, start from
member or viewer); a role's sheet with who holds it, and rename or delete for the workspace's own.
Phones: the list with counts and the chosen role's switches. Members, the member sheet and invites
offer Viewer and custom roles; screens that asked "not a member?" now ask the right question
(admin, or the permission).

## Validation

- `bun run lint` 0, typecheck per package 0, `bun run architecture:check` OK, `vite build` OK.
- Console vitest 562 (new: roles screen ×4, role choices and permissions in members rules).
- Runner 377 (new: `may` ×4, chat commands by role ×2, viewer refused a terminal over HTTP).
- API 128 unit; `@grid/db` roles ×2; contract against this branch's API: workspaces 10 pass (new:
  role permissions merge, viewer and custom role on a member, custom role removal; a viewer reads
  projects but cannot create one or invite, until the workspace lets viewers invite viewers).
- Migration applied to the dev database. Chromium on this branch: desktop table toggled and
  reloaded, New role → column added → deleted; phone list and switches; Members offers Viewer.
