# Grid API

The Grid API, `/api/v1/...`: accounts and sign-in (password, 2FA, passkeys, Google, magic
links), sessions, projects, tasks, notes, profiles and billing. Hono on `Bun.serve`, Postgres
through [`@grid/db`](../../packages/db) (Drizzle on `Bun.sql`). It replaced the NestJS API; the
move is described in [.agents/plans/api-on-hono.md](../../.agents/plans/api-on-hono.md).

## Run

```bash
cp apps/api/.env.example apps/api/.env   # once; Bun loads it on its own
bun run db:migrate                       # from the repo root
bun run dev                              # everything, this API on :4000
bun --cwd=apps/api run dev               # this API alone
bun --cwd=apps/api test                  # unit tests (database ones skip without DATABASE_URL)
bun --cwd=apps/api run test:contract     # black-box tests against a running API
```

`bun run grid` runs the whole product behind one port; the launcher gives this API its secrets,
database and an uploads folder in Grid's data directory.

## Layout

| Path | What |
| --- | --- |
| `src/main.ts` | `Bun.serve`, the database, shutdown |
| `src/app.ts` | Middleware, the mounted modules, uploaded files, 404 and error handling |
| `src/config/` | Environment (zod) |
| `src/http/` | Shared pieces: `ok`/`noContent`, `ApiError` and helpers, `parse`/`body` (zod), `requireUser`, `rateLimit`, request ids |
| `src/modules/<name>/` | One area's routes and logic: plain functions, Drizzle queries |
| `test/contract/` | Black-box HTTP tests that pin the responses clients rely on |

## Conventions

- Success bodies through `ok(c, data, status)`, and `noContent(c)` for 204. Errors are
  `ApiError`s (`notFound(...)`, `unauthorized({ code, message })`…), rendered in one shape.
- Validate input with `body(c.req, schema)` / `parse(schema, value)`: a 400 `VALIDATION_ERROR`
  with field errors.
- Signed-in routes use `requireUser(deps.sessions)`; the user is `c.get("user")`.
- Throttle sensitive routes with `rateLimit({ limit, windowMs })`.
- A change to a response the clients see comes with a contract test. Contract suites sign in
  through `demoToken()` (sign-in is rate limited), so run the suite at most once a minute.
- Bun first: `Bun.password`, `Bun.sql`, `Bun.file`/`Bun.write`, `Bun.CryptoHasher`, WebCrypto.
  Add a package only when neither Bun nor Hono does the job.
