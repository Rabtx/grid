# Grid API (Hono on Bun)

The Grid API, `/api/v1/...`, replacing `apps/nest-api` one module at a time. The plan and the
rules are in [.agents/plans/api-on-hono.md](../../.agents/plans/api-on-hono.md).

While the port is under way this API owns the API port (4000) and **forwards every route it
does not serve yet to NestJS** behind it (`GRID_LEGACY_API_URL`, 4010 in dev), unchanged. So a
module moves over simply by adding its routes here.

## Run

```bash
bun run dev                  # from the repo root: this API on :4000, NestJS on :4010, and the rest
bun --cwd=apps/api run dev   # this API alone (reads apps/nest-api/.env during the move)
bun --cwd=apps/api test      # unit tests (app.request, no server)
```

## Layout

| Path | What |
| --- | --- |
| `src/main.ts` | `Bun.serve`, the database, shutdown |
| `src/app.ts` | Middleware, the mounted modules, forwarding to NestJS, 404 and error handling |
| `src/config/` | Environment (same variables and defaults as NestJS) |
| `src/http/` | Shared pieces: `ok`/`noContent`, `ApiError` and helpers, `parse`/`body` (zod), `requireUser`, `rateLimit`, request ids |
| `src/modules/<name>/` | One module's routes and logic |
| `test/contract/` | Black-box HTTP tests run against NestJS **and** this API |

The database schema and migrations are in [`packages/db`](../../packages/db) (`@grid/db`).

## Porting a module

1. Read the NestJS module (`apps/nest-api/src/modules/<name>`): its controllers (routes, status
   codes, guards, throttles), DTOs (zod schemas) and service (behaviour and error messages).
2. Write the **contract tests first** in `test/contract/<name>.test.ts`, using `call`, `json` and
   `stable` from `test/contract/client.ts`. Run them against NestJS until they pass:
   `CONTRACT_API_URL=http://127.0.0.1:4010 bun run test:contract` (once a minute per server:
   sign-in is rate limited). Sign in through `demoToken()` from the client, never on your own.
3. Port the module to `src/modules/<name>/`: a `routes.ts` exporting a function that returns a
   `Hono<AppEnv>`, plus plain functions for the logic and the queries (`@grid/db` and Drizzle).
   No classes or decorators are needed. Mount it in `src/app.ts` next to `healthRoutes()`.
4. Match the old contract exactly:
   - success bodies through `ok(c, data, status)`, and `noContent(c)` for 204
   - errors as `ApiError`s, e.g. `notFound(\`Project "${slug}" not found\`)` or
     `unauthorized({ code: "AUTH_REQUIRED", message: "Authentication required" })`, keeping
     NestJS's codes and messages
   - validation through `body(c.req, schema)` / `parse(schema, value)`, which answer
     `VALIDATION_ERROR` with the same field errors
   - signed-in routes behind `requireUser(deps.sessions)`, with the user as `c.get("user")`
   - route throttles with `rateLimit({ limit, windowMs })`, the same numbers as `@Throttle`
5. Run the contract tests against this API (`CONTRACT_API_URL=http://127.0.0.1:4000 bun run test:contract`); they must
   pass on both. Add unit tests with `app.request()` for logic the contract does not reach.

Bun first: `Bun.password`, `Bun.sql` (through `@grid/db`), `Bun.file`/`Bun.write`, WebCrypto.
Add a package only when neither Bun nor Hono does the job, and say why on the card.
