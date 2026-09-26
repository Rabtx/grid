# API on Hono, then workspaces

Replaces Phase 2 of [portable-next](portable-next.md). Two large changes, landed one after the
other so a bug is always traceable to one of them:

1. **Port** `apps/nest-api` (NestJS on Express, ~6,400 lines, 49 routes) to `apps/api` (Hono on
   Bun) **without changing behaviour**. The console, runner and web app notice nothing.
2. **Then** build workspaces (the company owns the work) as the first feature on Hono.

## Why

- The API is the one part of Grid still built the Node way: 36 packages. On Hono and Bun about
  20 of them go (express, helmet, cookie-parser, multer, @nestjs/\*, rxjs, reflect-metadata,
  bcryptjs, dotenv, ts-node, ts-loader, tsconfig-paths, source-map-support, supertest, vitest).
- Bun first: `Bun.serve`, `Bun.password`, `Bun.sql` (Drizzle's `bun-sql` driver), Bun's own
  `.env` loading, `bun test` with `app.request()`. Hono because it is built on web standards
  (the same `Request`/`Response` as the runner), runs on Bun without tying Grid to it, and gives
  the console a typed client.
- Not Rust for the API: the API waits on Postgres, so a faster runtime changes little, and a
  second language would split types with the console. Rust is for the runner's hot paths later.

## How the port stays safe

- **Strangler**: `apps/api` takes the API port (4000). Any route it does not serve yet is
  forwarded, untouched, to NestJS on an internal port (`GRID_LEGACY_API_URL`, default
  `http://127.0.0.1:4010`). Every merge ships working software.
- **Same contract**: `/api/v1/...` paths, the `{ success, statusCode, requestId, timestamp,
  data }` envelope, the error body (`code`, `message`, `path`, `method`, `errors`), the
  `x-request-id` header, cookie names and attributes, status codes.
- **Contract tests** (`apps/api/test/contract/`): black-box HTTP tests that run against a base
  URL. They must pass against NestJS **and** Hono before a module's routes switch over:
  `bun test test/contract` with `CONTRACT_API_URL` set to either server.
- **One database**: the Drizzle schema, migrations, migrate, seed and owner scripts move to
  `packages/db` (`@grid/db`), shared by both APIs until NestJS is deleted.

## Rules for every card

- Bun-native first; add a package only when Bun and Hono have nothing for the job, and say why
  on the card.
- Port behaviour, not structure: plain functions and modules, no DI container, no decorators.
- Every ported route is covered by a contract test, plus unit tests where logic moved.
- Stay inside `apps/api/src/modules/<your module>/` and your contract tests; shared pieces
  (`src/app.ts`, `src/http/*`, `packages/db`) change only through the foundation owner.

## Phases and cards

| Phase | Card | Owner | Depends on |
| --- | --- | --- | --- |
| 0 | `hono-foundation`: `packages/db`, `apps/api` skeleton, forwarding, contract harness, health | lead | — |
| 1 | `hono-auth-core`: users, sessions, register/login/refresh/logout, email verify, password reset, email | lead | 0 |
| 1 | `hono-workspace-data`: projects, tasks, notes, profiles (incl. avatar uploads) | agent | 0 |
| 1 | `hono-billing`: plans, checkout, Stripe and Razorpay webhooks (raw body signatures) | agent | 0 |
| 2 | `hono-sign-in-methods`: TOTP 2FA, passkeys, Google sign-in | agent or lead | auth-core |
| 3 | `hono-cutover`: launcher, dev, devcontainer, Docker, docs on `apps/api`; delete `apps/nest-api` | lead | all above |
| 4 | `workspaces`: tenancy model below | lead + agents | cutover |
| 5 | `pglite-optional`: `@grid/db` on PGlite when no `DATABASE_URL` | agent | cutover |

## Workspaces (phase 4), as agreed

- A **workspace** is the company. It owns projects, billing (subscriptions move from user to
  workspace), environments, and later agents and secrets. Two levels only: workspace → projects.
- People belong to many workspaces (`workspace_members`: owner, admin, member; guest later) and
  switch between them. The workspace slug is in the URL: `/acme/board/web-app`.
- **First install**: the launcher prints a one-time setup link with a code (replacing
  `.grid/owner.txt`). Setup: account → workspace (name, slug, look) → first project → connect
  agents → invite teammates.
- **Signup** on a self-hosted Grid is closed by default; people join by invite (link or email),
  and the owner can open it.
- **Migration**: every existing user gets a personal workspace holding their projects, tasks,
  notes and subscription. The runner's per-user keys (folders, chats, environments) move to the
  workspace.
- The UI surfaces (setup, switcher, members, invites) come with the redesign.
