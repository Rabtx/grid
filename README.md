# Grid

**Grid is an AI-native operating system for building and running a startup.** It brings projects,
agents, development, deployment, infrastructure, operations and management into one
browser-accessible control plane.

For developers: a browser-first, plugin-driven control plane that coordinates humans, AI agents,
workspaces, tools and infrastructure. Grid is not an IDE with AI bolted on — agents are
first-class workers inside the system, and Grid is the layer that coordinates them.

The guiding constraints:

- **Browser first** — the browser is the interface; execution happens on a host that may be local,
  Docker, SSH or a remote VPS.
- **Agent-native** — humans, agents, automations and runners are all entities that perform work.
- **Provider agnostic** — no single AI provider becomes architectural bedrock.
- **Portable** — machines are disposable; projects, tasks, sessions and context are not.

## Where this repository is today

This repository holds the **engineering spine** Grid is being built on — a Bun workspaces
monorepo with the web client, API, mobile control surface, docs site, shared UI and the full
lint/typecheck/test/CI surface. The Grid product surfaces described above (board, agent runs,
workspaces, ship, operate) are **not implemented yet**.

Multi-agent development of Grid itself runs through [.agents/](.agents/README.md).

## Quick start

**Prerequisites**

- [Bun](https://bun.sh) `1.4.2` (pinned via `packageManager` and `.mise.toml`)
- [mise](https://mise.jdx.dev) — `mise install` also provides `shellcheck` and `shfmt`, which
  `bun run lint` and `bun run format` need for the shell scripts
- Optional: Docker Compose `v2.20+`, Rust toolchain (`packages/logger` Rust side)

```bash
git clone https://github.com/shabirkhan-dev/grid.git
cd grid
bun install
bun run prepare
bun run dev
```

`bun run dev` starts every workspace.

| App | Dev URL |
| --- | --- |
| Web | http://localhost:3000 |
| Console | http://localhost:3001 |
| Nest API | http://localhost:4000 — `/api/v1/health`, `/api/docs` |
| Docs | http://localhost:3002/docs |

To work on one app in isolation: `bun --cwd=apps/web run dev` (same pattern for `nest-api`
and `docs`).

## Layout

### Apps

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js 16 — landing page and the outgoing control plane |
| `apps/console` | Vite + Solid 2 SPA — the control plane being built to replace it |
| `apps/nest-api` | NestJS API spine, Drizzle over Postgres/Neon |
| `apps/docs` | Fumadocs site — project docs at `/docs` |

### Packages

| Package | Path | Role |
| --- | --- | --- |
| `@grid/ui` | `packages/ui` | shadcn base — the unopinionated primitives |
| `@grid/logger` | `packages/logger` | Shared structured logging |
| `@grid/typescript-config` | `packages/typescript-config` | Base tsconfigs every workspace extends |

### Everything else

| Path | Purpose |
| --- | --- |
| `.agents/` | Agent contract, roles, board and skills — the single source; there is no second copy |
| `docker/` | Compose fragments: Postgres, Nest, web, optional profiles |
| `scripts/` | Shell utilities, git hooks, plus architecture and naming checks |
| `.github/workflows/` | `ci.yml`, `cd.yml`, `security.yml` |
| `.devcontainer/` | Bun + Rust + Bash tooling |

## Commands

| Command | Does |
| --- | --- |
| `bun run dev` | All dev servers |
| `bun run build` | Build every app |
| `bun run lint` / `lint:fix` | oxlint, plus ShellCheck over `scripts/` |
| `bun run format` | Format TS/JS, shell and the Rust logger |
| `bun run typecheck` | TypeScript across workspaces |
| `bun run test` / `test:coverage` | Unit tests / coverage gates |
| `bun run test:e2e:web` | Playwright e2e for web |
| `bun run architecture:check` | Import-boundary rules |
| `bun run naming:check` | File and symbol naming rules |
| `bun run preflight` | `lint` + `typecheck` + `test` — run before pushing |

## Tooling

- **Bun** workspaces, with `bun run --filter` driving tasks across them
- **oxlint + oxfmt** for TS/JS — tabs, line width 100
- **Lefthook** pre-commit and commit-msg, enforcing Conventional Commits
- Bash: ShellCheck + shfmt · Rust: rustfmt + clippy

## Docker

```bash
cp env.docker.example .env
docker compose up -d --build
```

Web `:3000`, Nest `:4000`, Postgres on host `:5433`.

More in [docker/README.md](docker/README.md) and `/docs/docker`.

## Deploy

| Piece | Host | Config |
| --- | --- | --- |
| Web + docs | [Vercel](https://vercel.com) | `apps/*/vercel.json` |
| Nest API | [Render](https://render.com) | `render.yaml` |
| Database | [Neon](https://neon.tech) | `DATABASE_URL` |

Walkthrough: `/docs/deploy` — [apps/docs/content/docs/deploy.mdx](apps/docs/content/docs/deploy.mdx).

## Dev Container

`.devcontainer/` installs **Bun**, **Rust** and the Bash lint tools. C, Lua and Python are
deliberately excluded.

```text
Reopen in Container → bun run prepare → bun run dev
```

See [.devcontainer/README.md](.devcontainer/README.md).

## Docs

```bash
bun --cwd=apps/docs run dev
```

- [/docs/quick-start](http://localhost:3002/docs/quick-start)
- [/docs/architecture](http://localhost:3002/docs/architecture)
- [/docs/deploy](http://localhost:3002/docs/deploy)
- [/docs/docker](http://localhost:3002/docs/docker)

Also in the repo: [PROJECT.md](PROJECT.md), [DESIGN.md](DESIGN.md), [AGENTS.md](AGENTS.md),
[CHANGELOG.md](CHANGELOG.md).

## License

Dual-licensed under **MIT** or **Apache-2.0**, at your option —
[LICENSE-MIT](LICENSE-MIT), [LICENSE-Apache-2.0](LICENSE-Apache-2.0).
