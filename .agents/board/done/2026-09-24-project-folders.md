---
title: Projects own their chats and folders
role: ui-ux
status: done
branch: agent/ui-ux/project-folders
---

## Goal

Chat lives inside a project instead of behind a project dropdown. Projects can be added from any
folder on the machine Grid runs on, and existing projects can be linked to their folder, so chats
and terminals start there.

## Scope

- `apps/runner/src/folders/*` — folder browsing (`GET /fs/folders`), folder inspection
  (`GET /fs/inspect`, name + git origin as a web URL), project folder links
  (`GET /projects/folders`, `PUT /projects/folders/:slug`), stored in the chat database.
- `apps/runner/src/chat/{hub,store}.ts` — new chats default to the project's linked folder.
- `apps/runner/src/server.ts` — routes, plus one hello timer per socket that is cleared on close.
- `apps/console` — `/chat/:project/:id` routes, project-aware nav (Board/Chat keep the current
  project), Add project sheet (folder browser → name/short name/repository → create + link),
  Choose folder sheet, terminals open in the project's folder.

## Validation

- `bun --cwd=apps/runner test`: 39 pass, 0 fail.
- `bun --cwd=apps/console run test`: 147 passed.
- `bun run lint`, `bun run typecheck`, `bun run architecture:check`: clean.
- Playwright on phone and desktop: no project select in chat; Add project created `shop-app`
  from `~/Projects/shop-app` with its origin read as the repository, linked the folder,
  navigated to `/chat/shop-app`, header and folder line correct, no console errors.
