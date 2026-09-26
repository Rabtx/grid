# Grid project reference

[README.md](README.md) explains the product and the fastest way to run it. This file describes
how the current implementation is divided, where state lives, and which commands developers use.
The planned product extends beyond the features in this repository today.

## Runtime boundaries

| Component | Responsibility | Current stack |
| --- | --- | --- |
| `apps/console` | Project workspace: boards, agent threads, files, terminals, settings, and environments | Vite, Solid 2, installable PWA |
| `apps/runner` | Execute coding agents and terminals beside the project folder; serve file operations, chat events, and environment connections | Bun, WebSockets, SQLite for chat logs |
| `apps/api` | Accounts, sessions, projects, tasks, notes, profiles, and billing | Hono on Bun, Drizzle (`packages/db`), PostgreSQL |
| `apps/launcher` | Prepare a Grid instance and put console, API, and runner behind one port | Bun |
| `apps/web` | Existing Next.js web app, separate from the active Solid product console | Next.js |
| `apps/docs` | Human-readable setup, API, architecture, and deployment documentation | Fumadocs |

In the integrated setup, the browser talks to one Grid origin. The launcher serves the console
and forwards `/api` to the API and `/runner` to the runner, including WebSockets. The API owns
account and task data;
the runner executes agents and terminals where project files live. Agent adapters translate
provider-specific protocols into the chat events the console displays. See the
[agent chat plan](.agents/plans/agent-chat.md) for that boundary and the
[architecture docs](apps/docs/content/docs/architecture/index.mdx) for import rules.

A home Grid can pair with another Grid as an **environment**. A project's folder placement
selects the machine for its agents, files, and terminals. The home instance keeps account and
project metadata; execution and its session log live on the selected runner. See the
[portable Grid guide](apps/docs/content/docs/portable.mdx) for pairing and security details.

## State and portability

| State | Where it lives |
| --- | --- |
| Accounts, projects, tasks, notes, and billing records | PostgreSQL through `apps/api` (schema in `packages/db`) |
| Project source files | Linked folder on the selected machine |
| Agent session event logs | SQLite on the runner that executes the session |
| Recent chats, terminal screens, and workspace snapshots | IndexedDB on this browser, scoped to the signed-in account; refreshed from the runner |
| Appearance preferences | Browser local storage |
| Generated secrets and first owner credentials | The launcher's data directory (`.grid/` by default) |

A cached screen helps Grid open quickly, but it does not replace the runner or make agent
execution offline. Treat the project repository and runner data as durable state when choosing
where to host an environment. The [portable guide](apps/docs/content/docs/portable.mdx) covers
data paths and deployment options.

## Run the product

Install dependencies and start the integrated instance from the repository root:

```bash
bun install
bun run grid
```

Bun is pinned to **1.4.2** in `package.json`. Set `DATABASE_URL` to an existing PostgreSQL
instance or have Docker with Compose available so the launcher can start Postgres. The gateway
uses port `8080` by default (`GRID_PORT` changes it). On first start it prints a one-time setup
link (also in `.grid/setup-link.txt`) for creating the owner account and first workspace. See [portable Grid](apps/docs/content/docs/portable.mdx) for Codespaces,
VPS, pairing, and configuration.

## Development commands

`bun run grid` is the integrated product path. `bun run dev` starts workspace development
servers separately; the usual local ports are console `3001`, web `3000`, API `4000`, runner
`4100`, and docs `3002`.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start workspaces with development scripts |
| `bun --cwd=apps/console run dev` | Work on the Solid console |
| `bun --cwd=apps/runner run dev` | Work on the local execution runner |
| `bun --cwd=apps/api run dev` | Work on the API |
| `bun --cwd=apps/docs run dev` | Browse docs at `http://localhost:3002/docs` |
| `bun run build` | Build workspaces |
| `bun run lint` / `bun run format` | Check code style / format source |
| `bun run typecheck` / `bun run test` | Type-check / run unit tests |
| `bun run architecture:check` | Check import boundaries and path naming |
| `bun run preflight` | Run lint, typecheck, and tests |

Use `bun run prepare` to install Lefthook Git hooks. The root uses oxlint and oxfmt for
TypeScript and JavaScript; ShellCheck and shfmt cover scripts. CI configuration lives in
`.github/workflows/`. See [quick start](apps/docs/content/docs/quick-start.mdx) and
[development workflow](apps/docs/content/docs/development-workflow.mdx) for setup details.

## Current work and design direction

The [open board](.agents/board/open/) lists the next scoped changes. The
[agent chat plan](.agents/plans/agent-chat.md),
[console plan](.agents/plans/console-design-migration.md), and
[portable Grid plan](.agents/plans/portable-next.md) contain longer-term ideas, some of which
have already shipped. Check board cards and source before treating a plan's phase label as
current status. There are no release dates attached to these plans.

The [design system](DESIGN.md) guides the interface. [AGENTS.md](AGENTS.md) and
[.agents/](.agents/README.md) define ownership, worktrees, board cards, review, and validation.
Project docs live in `apps/docs/content/docs/`; there is no root `docs/` directory.
