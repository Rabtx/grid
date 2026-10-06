# `@grid/db`

Database layer for Grid: Drizzle ORM schema, migrations, and dual-mode database client.

## Engines: PGlite vs PostgreSQL

Grid supports two database engines with the exact same Drizzle schema, migrations, and queries:

1. **Embedded PGlite (Default when `DATABASE_URL` is unset)**
   - Powered by `@electric-sql/pglite` (WebAssembly Postgres).
   - Runs in-process with no background server or Docker requirement.
   - Ideal for laptops, GitHub Codespaces, disposable environments, and local evaluation (`bun run grid`).
   - Data persists locally to `.grid/db/` (or `$GRID_DATA_DIR/db`).
   - When running inside `apps/api`, a local wire-protocol socket server is launched automatically to allow external clients (e.g., `psql`, contract tests, Drizzle Studio) to connect to the active instance.

2. **Full PostgreSQL (When `DATABASE_URL` is set)**
   - Powered by Bun's native SQL client (`Bun.sql`) and `drizzle-orm/bun-sql`.
   - Used for 24/7 self-hosted servers, Docker environments, and hosted providers (Neon, Render, Supabase).
   - Required in production (`NODE_ENV=production`).

## How Grid picks

- If `DATABASE_URL` is defined (e.g. `postgresql://user:pass@host:5432/dbname`), `@grid/db` connects via `Bun.sql`.
- If `DATABASE_URL` is undefined or empty:
  - If a running Grid API instance has an active socket server, clients connect to its socket URL.
  - Otherwise, an embedded PGlite instance is opened at `$GRID_DATA_DIR/db` (or `<repo>/.grid/db`).
  - Specifying `:memory:` opens a transient in-memory PGlite instance (useful for unit testing).

## Configuration

| Environment Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | _Unset (defaults to PGlite)_ |
| `GRID_DATA_DIR` | Base data directory for Grid | `<repo>/.grid` |
| `PGLITE_DATA_DIR` | Explicit folder path for PGlite database files | `$GRID_DATA_DIR/db` |
| `PGLITE_PORT` | Preferred TCP port for PGlite socket server | `5433` (falls back to an ephemeral port) |
| `DATABASE_POOL_MAX` | Max connection pool size for Bun.sql | `10` |
| `DATABASE_SSL` | Force SSL connection (`true` / `false`) | Autodetected (Neon / sslmode) |

## Commands

```bash
# Run migrations (against PGlite if DATABASE_URL unset, or against PostgreSQL)
bun run --filter @grid/db migrate

# Seed demo account and tasks
bun run --filter @grid/db seed

# Typecheck and lint
bun run --filter @grid/db typecheck
bun run --filter @grid/db lint

# Run unit tests
bun run --filter @grid/db test
```
