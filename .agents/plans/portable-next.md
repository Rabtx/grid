# Portable Grid — next phases

Phase 1 (done, `/docs/portable`): `bun run grid` runs the whole product from one command behind one
port, on a laptop, a VPS (`docker/compose/grid.yml`) or a Codespace (`.devcontainer/`).

## Phase 2 — API on Hono

Replace `apps/nest-api` (NestJS on Express) with a Hono API that runs unchanged on Bun, in a
container or serverless (edge/lambda), keeping Postgres and the Drizzle schema and migrations.

- Port module by module behind the same `/api/v1` contract, so the console doesn't change:
  health → auth (sessions, refresh cookie, OTP, passkeys, Google) → profiles → projects/tasks →
  billing.
- Validation stays zod; the Drizzle schema and `src/database/migrations` move as they are.
- Done when the console's e2e flows pass against Hono and `apps/nest-api` is removed, with its
  dependencies (Nest CLI, class-validator, Express) gone from the lockfile.

## Phase 3 — Postgres optional

For a laptop or a throwaway Codespace, run without a Postgres server: PGlite (Postgres in WASM,
same SQL and Drizzle dialect) under the data dir when `DATABASE_URL` is unset, instead of starting
Docker. Postgres stays the production database.

## Phase 4 — Grids as environments

One Grid can add another Grid (a VPS, a Codespace, a teammate's laptop) as an environment: pair
with a token, then run threads and terminals there through the remote runner, with results and
transcripts flowing back to the home Grid. Execution environments stay disposable; projects,
tasks and sessions stay in the home Grid.

- Runner-to-runner pairing and auth; project folders mapped per environment.
- Environment picker on a project and in the composer.
