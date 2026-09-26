# Portable Grid — next phases

Phase 1 (done, `/docs/portable`): `bun run grid` runs the whole product from one command behind one
port, on a laptop, a VPS (`docker/compose/grid.yml`) or a Codespace (`.devcontainer/`).

## Phase 2 — API on Hono

Planned in detail, with workspaces after it, in [api-on-hono](api-on-hono.md).

## Phase 3 — Postgres optional

For a laptop or a throwaway Codespace, run without a Postgres server: PGlite (Postgres in WASM,
same SQL and Drizzle dialect) under the data dir when `DATABASE_URL` is unset, instead of starting
Docker. Postgres stays the production database.

## Phase 4 — Grids as environments

One Grid can add another Grid (a VPS, a Codespace, a teammate's laptop) as an environment: pair
with a token, then run threads and terminals there through the remote runner, with results and
transcripts flowing back to the home Grid. Execution environments stay disposable; projects,
tasks and sessions stay in the home Grid.

- Done (`agent/backend/environments-link`): runner-to-runner pairing over the tailnet
  (one-time code → hashed secret bound to the person), the home runner relaying `/env/<id>/…`
  so the person's session never leaves home, Settings → Environments, terminals on an
  environment, and a Codespace joining the tailnet via Tailscale's dev container feature.
- Next: agent chats and project folders on an environment; environment picker on a project and
  in the composer.
- Then: GitHub sign-in to list, create, start and stop Codespaces from Grid, and GitHub's
  private port forwarding as a second route for people without Tailscale.
