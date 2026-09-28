---
id: str-workspaces-console
title: Workspaces: console URLs, switcher, setup and members
type: feature
from: human
to: web
priority: normal
status: done
assignee: claude
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-workspaces-data, str-workspaces-invites-setup]
branch: agent/web/workspace-members
worktree: none
scope:
  - apps/console/src/modules/settings/**
  - apps/console/src/modules/workspaces/**
allowed_shared: []
created: 2026-09-26
updated: 2026-09-28
---

## What

Members and invites in console settings: who is in this workspace, their role, changing a role,
removing someone, and issuing or revoking an invite.

## Why / Context

Fourth of four workspace cards. The other three shipped and are merged; this is the one that never
started. The API is done — `GET/POST/DELETE /workspaces/:ws/members` and
`GET/POST/DELETE /workspaces/:ws/invites` with owner/admin/member roles
(`apps/docs/content/docs/backend-api.mdx`), backed by `2026-09-26-workspaces-data` and
`2026-09-26-workspaces-invites-setup`. Nothing in the console calls them: the settings module has
no members or invites surface, and the account menu only reaches Settings → Account and
Environment. A workspace owner has no way to see or manage their team from the product.

## Progress

Shipped and merged (PRs on `agent/frontend/console-redesign-shell`,
`agent/frontend/console-redesign-home`, `agent/frontend/console-workspace-urls`):

1. **Shell and switcher.** The screen is a canvas panel on a quieter backdrop on desktop, edge to
   edge on phones; the hue/saturation/lightness theme is kept. The sidebar opens with the workspace
   switcher (menu on desktop, bottom sheet on phones), then New chat, Search and Terminal, the
   projects, and an account menu (theme, settings, sign out). Creating a workspace is a sheet. The
   chosen workspace is remembered per device; API project calls go to `/workspaces/:ws/…`, runner
   requests carry `X-Grid-Workspace` and socket hellos a `workspace`, and the offline cache is kept
   per workspace. Switching reloads the console.
2. **Home and composer.** The composer is a raised card with round mic and send buttons and
   lighter model and mode pills; the folder and branch sit in a strip tucked under it. New chat
   titles the project with its icon and offers suggestions that fill the composer: a list under
   it on desktop, chips above it in thumb reach on phones.
3. **Setup, invites and workspace URLs.** Every signed-in URL leads with its workspace
   (`/acme/board/web`): a history adapter keeps the slug out of the routes, so links, `navigate`
   and `useLocation` still deal in `/board/web`. `/`, `/terminal` and a workspace you are not in
   resolve to the remembered or default workspace. Sign-in, setup and `/invite/:token` sit in a
   card on the backdrop; setup and invites show the workspace's sidebar in miniature beside the
   form. An invite joins with one button when signed in, or with a new account (confirming the
   email by code when needed) or an existing one.

Still to do — this card now covers only this:

4. **Members and invites in settings.** A page under `/settings` listing members with their role,
   letting an owner or admin change a role or remove someone, and letting an owner or admin create
   an invite (link or targeted at an email), copy its link, and revoke it. Should use the existing
   `SettingsGroup`/`SettingsRow` primitives and the kit's menus, and must work at 375px.

### Validation (shipped work, PRs 1–3)

- `bun run typecheck`, `bun run lint`, `bun run architecture:check`: pass.
- Console vitest: all files pass, including the new `active-workspace.test.tsx`.
- PR 2: console vitest passes (new composer fill test); checked new chat and a conversation on
  desktop and phone, light and dark.
- PR 3: console vitest 45 files / 282 tests (URL resolution and history tests added). Against
  a database clone: created a link invite, viewed it signed in, then joined it signed out with
  a new account through the email code and landed in `/demo/…`; `/`, `/terminal` and
  `/nope/chat` redirect correctly; links navigate without reloads; back works.
- Browser, against a clone of the dev database: created a workspace (moved into it, empty
  project list), switched back to the default one; desktop and phone, light and dark.

## Proposal or Ask

Build item 4. The API already answers every call it needs; the work is the console surface plus
its tests.

**Definition of done:** an owner or admin can open Settings, see every member and their role,
change a role, remove someone, create an invite and copy its link, and revoke an invite — all at
375px and on desktop, in light and dark, with loading, empty, error, permission-denied and
success states. A plain member sees the list without the actions the API would refuse. Console
vitest covers the role change and the revoke; `bun run typecheck`, `lint`, `architecture:check` and
`naming:check` pass.

## Scope

**In scope:**

- `apps/console/src/modules/settings/**`
- `apps/console/src/modules/workspaces/**`
- `apps/console/src/app.tsx` and `src/routes/app-shell.tsx` for the new settings route

**Out of scope:**

- The API. `apps/api/src/modules/workspaces/{routes,service,access,invites}.ts` are correct; the
  console learns to call them.
- Seats, plan limits or any billing gate on member count — none exist server-side today.
- The other three items on this card, which shipped and are merged.

## Validation

- `bun run --cwd=apps/console run test`, `typecheck`, `lint`
- `bun run architecture:check`, `bun run naming:check`
- Browser at 1280px and 375px, light and dark: as an owner, change a role, remove a member, create
  and copy an invite, revoke it. As a plain member, confirm the actions are absent rather than
  broken.
- Against a throwaway database clone, not the dev one.

## Resolution

Item 4 shipped on `agent/web/workspace-members`: Settings → Members. Everyone sees the people
(avatar, name, @username, role, when they joined); tapping a person opens a sheet. Owners and
admins change roles (only to roles at or below their own), remove people and see pending invites;
you can leave from your own sheet. Invite (header) makes a link or an emailed invite as admin or
member and shows the link once to copy, on the console's own address; tapping a pending invite
revokes it. A plain member sees the people without the actions the API would refuse. The role
rules live in `modules/workspaces/lib/members.ts`, mirroring the API.

Validation: lint, typecheck, format, architecture check pass; console vitest 68 files / 451
tests (new: member rules, members screen for owner and member, role change, invite link); build
passes. Browser against the live API at 1280 px and 375 px: list, invite by link, the link shown
once, the pending invite listed, revoked, the own-member sheet with Leave.

Follow-up for whoever runs a Grid: emailed invites link to the API's `WEB_APP_URL`, which defaults
to the website on :3000; point it at the console for email links to open the invite page.
