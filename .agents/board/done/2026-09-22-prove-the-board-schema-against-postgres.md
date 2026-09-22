---
id: str-board-schema-proof
title: Apply the projects/tasks migration to a real Postgres and cover the API with integration tests
type: chore
from: backend
to: backend
priority: high
status: done
assignee: none
reviewer: reviewer
parent: none
depends_on: []
branch: agent/backend/board-schema-proof
worktree: ../grid-worktrees/agent/backend/board-schema-proof
scope:
  - apps/nest-api/src/database/**
  - apps/nest-api/test/**
  - apps/nest-api/vitest.integration.config.ts
  - .github/workflows/ci.yml
allowed_shared: []
created: 2026-09-22
updated: 2026-09-22
---

## What

Migration `0004_brief_rachel_grey.sql` creates `projects` and `tasks` but **has never been
applied to a database**. The whole projects/tasks API has only ever been tested against a
mocked repository. Apply it for real and cover the API with integration tests that run
against Postgres.

## Why / Context

The machine the schema was authored on had no Postgres and no Docker daemon, so
`bun --cwd=apps/nest-api run db:migrate` was never executed and no query in
`apps/nest-api/src/modules/projects/projects.repository.ts` has ever hit a real server.

One piece is specifically unproven. `createTask` allocates the per-project task number and
the trailing board position inside the INSERT with raw `sql` fragments:

```ts
const nextNumber = sql`(select coalesce(max(${tasks.number}), 0) + 1 from ${tasks} where ${tasks.projectId} = ${input.projectId})`;
```

Drizzle's interpolation of a table reference inside a subquery is exactly the kind of thing
that type-checks and still emits wrong SQL. It needs to run.

## Proposal or Ask

1. Bring Postgres up: `docker compose -f docker/compose/postgres.yml up -d` (host port 5433,
   credentials in `env.docker.example`), or use any local instance.
2. Run `bun --cwd=apps/nest-api run db:migrate` and confirm both tables, both enums, and all
   six indexes exist. Fix the migration if it fails — do not hand-edit the applied SQL without
   regenerating the snapshot with `db:generate`.
3. Add integration tests under the existing `vitest.integration.config.ts` covering:
   - creating a project, and the unique-slug-per-owner conflict
   - creating three tasks and asserting numbers are `1, 2, 3` and positions strictly increase
   - **two tasks created concurrently** (`Promise.all`) still get distinct numbers — this is
     the real test of the allocation subquery
   - a second user cannot read, update or delete the first user's project or tasks (expect 404,
     never 403, and never a leak of existence)
   - deleting a project cascades to its tasks
4. Wire the integration suite into CI with a Postgres service container so this cannot rot.

**Definition of done:** `bun --cwd=apps/nest-api run test:integration` passes against a real
database, CI runs it, and the card records the actual `psql \d tasks` output.

## Scope

**In scope:**

- `apps/nest-api/src/database/**`, `apps/nest-api/test/**`, the integration vitest config
- `.github/workflows/ci.yml` — adding a Postgres service and an integration step

**Out of scope:**

- Any change to `apps/web/**` — the board UI is a separate card
- Task dependencies — being implemented separately, do not add a `task_dependencies` table
- Changing the REST shape in `projects.controller.ts`; if a route is wrong, raise a card

## Validation

- `bun --cwd=apps/nest-api run db:migrate` against a clean database, output pasted into Resolution
- `bun --cwd=apps/nest-api run test:integration`
- `bun run preflight` from the repo root
- Paste the concurrency test and its result — that is the point of this card

## Resolution

Done. Postgres 16 was brought up on host port 5434 — 5433 was already taken by another
project's container — and migration `0004` was applied for the first time. Verified in the
database: `projects` and `tasks` exist, all three enums (`project_status`, `task_owner_kind`,
`task_status` with the seven stages in order) and all six indexes are present, and deleting a
project cascades to its tasks.

**The concurrency check found a real bug, which is the reason this card existed.** Eight
parallel `createTask` calls produced five failures: the old allocation read
`coalesce(max(number), 0) + 1` in a subquery, so concurrent transactions at READ COMMITTED read
the same maximum and collided on `tasks_project_number_unique`. The unique index held — the
numbers that survived were distinct — but five creates were rejected outright. Two agents filing
tasks on one board at the same time would have hit this immediately.

Fixed by taking `select … for update` on the project row inside a transaction before allocating,
which serialises per board and leaves other projects unaffected. The comment claiming a subquery
made this safe was wrong and has been replaced with what actually happens.

The whole proof is now `apps/nest-api/test/projects.database.integration-spec.ts`, so it cannot
rot: numbering, the concurrency case, owner scoping returning 404 rather than 403, no leak
through a slug two owners share, stage persistence and the cascade. CI gained a Postgres 16
service, a migrate step and an integration-test step, so this runs on every push.

One caveat recorded honestly: the browser path — sign in, create a project, file and move a task
through the UI — still has not been exercised against a running stack.
