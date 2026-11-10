---
id: str-distributed-execution
title: Distributed execution across team-managed and BYOM machines
type: feature
from: human
to: backend
priority: high
status: doing
assignee: backend
reviewer: reviewer
parent: none
depends_on: []
branch: agent/backend/distributed-execution
worktree: ../grid-worktrees/agent/backend/distributed-execution
scope:
  - packages/db/src/schema/machines.schema.ts
  - packages/db/src/schema/index.ts
  - packages/db/migrations/0017_machines.sql
  - packages/db/migrations/meta/_journal.json
  - apps/api/src/config/env.ts
  - apps/api/src/config/config.ts
  - apps/api/src/modules/machines/**
  - apps/api/src/modules/runner/routes.ts
  - apps/api/src/app.ts
  - apps/runner/src/machines/**
  - apps/runner/src/config.ts
  - apps/runner/src/main.ts
  - apps/runner/src/owner.ts
  - apps/runner/src/server.ts
  - apps/runner/src/environments/relay.ts
  - apps/console/src/modules/environments/**
  - apps/console/src/lib/runner-client.ts
  - docker/runner.Dockerfile
  - docker/compose/machines.yml
  - docker/README.md
  - scripts/bash/**
  - apps/docs/content/docs/backend-api.mdx
  - apps/docs/content/docs/portable.mdx
  - .agents/board/doing/2026-11-10-distributed-execution.md
allowed_shared: []
created: 2026-11-10
updated: 2026-11-10
---

## What

Add a control-plane machine registry that supports two ways to run a teammate's agents:

1. **Team-managed** — the hosted Grid provisions an isolated rootless Docker container per teammate.
2. **BYOM** — a teammate installs Grid Runner on a laptop, VPS or server and enrolls it with a
   one-time code.

Both register the same way, share the workspace's projects, tasks, boards, context and role
permissions, and can be selected per project so agents execute on the machine the teammate picks.
A teammate may enroll several machines.

## Why / Context

Today a runner pairs peer-to-peer with one home Grid over Tailscale (`environments/`). That keeps
each person's sign-in local, but it cannot serve a team: the team server has no inventory of
machines, no central authorization, no managed provisioning and no way for two teammates to use
the same execution target. Threads already carry a `machine_id`, so the control plane needs a
first-class machine record instead of inferring machines from threads.

## Proposal or Ask

- Postgres `machines`, `machine_enrollments` and `machine_placements`.
- API: list/enroll/provision/remove machines, placements per project, runner-side enroll +
  heartbeat, and a runner-key-only endpoint that lets the hosted runner relay to machines.
- Runner: auto-enroll with `GRID_ENROLLMENT_CODE`, heartbeat, and `/machines/<id>/*` relay.
- Provisioner: hardened rootless Docker container per managed machine, per-machine volume,
  loopback-only runner port, no host mounts, dropped capabilities.
- Console: team machine list, BYOM install command, managed provisioning for machine admins, and
  machine choice in the existing picker.

**Definition of done:** a BYOM runner enrolls and appears online; a managed machine is created in
a rootless container; both are selectable for a project and relay agent traffic; management is
scoped by workspace role and the `machines` permission; tests and docs cover both paths.

## Scope

**In scope:** the paths listed in the front matter.

**Out of scope:** billing for managed machines, automatic container image publishing, and
Tailscale provisioning (the installer keeps its existing tailnet guidance).

## Validation

- `bun --cwd=apps/api run lint`, `typecheck`, `test`
- `bun --cwd=apps/runner run lint`, `typecheck`, `test`
- `bun --cwd=apps/console run lint`, `typecheck`, `test`
- `bun run architecture:check`
- Provision command builder unit tests; enrollment/heartbeat API tests; relay target tests.

## Resolution

Implemented on `agent/backend/distributed-execution`. Both modes share the Postgres
machine registry. A member may start one rootless container for themselves; someone with the
`machines` permission may start one for another member. Brought machines enroll with a one-time
code, and a shared runner only serves the workspace it joined. Settings → Machines can add either
kind. The runner image is `docker/runner.Dockerfile`; `docker/compose/machines.yml` is not included
from the root compose file.

Checked on 2026-11-10:

- `bun --cwd=apps/api run lint` — 0 errors. `typecheck` passed. `bun --cwd=apps/api run test` — 99 pass.
- `bun --cwd=apps/runner run lint` — 0 errors, 11 existing warnings. `typecheck` passed.
  `bun --cwd=apps/runner test` — 702 pass, 3 skip, 1 fail:
  `src/folders/source-control.test.ts` expected author `Sam` and got `Shabir Khan` from this
  machine's git identity. That file is unchanged on this branch.
- `bun --cwd=apps/console run lint` — 0 errors, 11 existing warnings. `typecheck` passed.
  `bun --cwd=apps/console run test` — 852 pass, then the machines screen gained one dialog test
  (3 pass in `machines-screen.test.tsx`).
- `bun run architecture:check` — passed.
- `bash -n` on `scripts/bash/install.sh` and `scripts/bash/grid.sh`.

Not run: a real `docker run` of `grid-runner:latest`, a live enrollment against the API, and a
browser pass of Settings → Machines. The screen was checked in Vitest (empty list, and the add
dialog's "Your computer" / "Team server" choice). No browser tools were available.
