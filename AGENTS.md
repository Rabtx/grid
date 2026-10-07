# Agent instructions (Grid)

Universal instructions for AI agents (Cursor, Copilot, Claude Code, Windsurf, Cline, Aider, etc.).
Read this file first when working in this repo.

## Project overview

**Grid is an AI-native operating system for building and running a startup** — a browser-first,
provider-agnostic control plane where humans and AI agents build, ship, operate and manage
products from one system. Agents are first-class workers, not a chat sidebar; execution
environments (local, Docker, SSH, VPS) are disposable while projects, tasks, sessions and context
persist. Do not treat Grid as a generic web dashboard or an isolated coding app: judge every change
by whether it serves that mission, and never couple Grid to one AI provider, one machine or one
deployment platform.

The Grid product surfaces (board, agent runs, workspaces, ship, operate) are not built yet. This
repository is currently the engineering spine they will be built on.

Monorepo managed with **Bun workspaces**. Apps, shared packages, and
multi-language scripts, all wired into a single lint/format/build/test surface.

## Before you write code

Multi-agent coordination lives in [.agents/](.agents/README.md). Load these in order:

1. This file
2. [.agents/README.md](.agents/README.md) — the protocol and directory map
3. [.agents/agent-contract.md](.agents/agent-contract.md) — behaviour, evidence, violation policy
4. Exactly one charter from [.agents/roles/](.agents/roles/README.md) — who you are and what you own
5. [.agents/worktrees.md](.agents/worktrees.md) — branch, port and worktree lifecycle
6. Your board card from [.agents/board/](.agents/board/README.md)

The short version: claim a card before coding, work in your own worktree on
`agent/<role>/<card-slug>`, write only inside the card's scope, stage explicit paths rather than
`git add -A`, and record real validation output on the card. `main` is integration-only.
[.agents/ownership.yaml](.agents/ownership.yaml) is the machine-readable role-to-path map.

## UI design context

Before changing UI components, read [DESIGN.md](DESIGN.md). It defines the material language,
motion restraint and the states every surface owes. All UI is built **mobile first** — follow
[.agents/skills/mobile-first](.agents/skills/mobile-first/SKILL.md): unprefixed Tailwind classes
are the phone layout and `sm:`/`md:`/`lg:` layer the desktop layout on top, in one component. Do not infer the design solely from existing
code. Keep that document as the shared source of truth instead of copying design rules into
agent-specific folders.

## Documentation

There is **no root `docs/` folder**. Project docs live in the docs app:

- Source: `apps/docs/content/docs/`
- Dev: `bun --cwd=apps/docs run dev`
- Browse: http://localhost:3002/docs

Key routes: `/docs/quick-start`, `/docs/architecture`, `/docs/docker`, `/docs/deploy`,
`/docs/qol`, `/docs/overrides`.
Also see root `README.md`, `PROJECT.md`, and `DESIGN.md`.

<!-- BEGIN:nextjs-agent-rules -->

# Solid: Solid 2 only

`apps/console` is the product and runs Solid 2. Before any Solid work, read
[.agents/skills/solid-2](.agents/skills/solid-2/SKILL.md) and check the installed typings — never
write Solid 1.x APIs (`createResource`, `onMount`, `Suspense`, `ErrorBoundary`, `classList`,
`solid-js/web`, `<Router root>`, `createAsync`…).

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->
## Repository layout

```
grid/
├── apps/
│   ├── console/         # Vite + Solid 2 SPA — the product (control plane), performance-first
│   ├── web/             # Next.js — to be trimmed to the marketing/landing site only
│   ├── api/             # The Grid API: Hono on Bun, PostgreSQL through packages/db
│   ├── runner/          # Bun service on this machine: terminals (PTY over WebSocket) for the console
│   ├── docs/            # Docs site (Fumadocs); source in apps/docs/content/docs/

├── packages/
│   ├── typescript-config/ # Shared tsconfig bases (base.json, nextjs.json)
│   ├── ui/              # Shared web UI primitives + shadcn styles/tokens
│   └── logger/          # Shared logger (TS + Rust)
├── scripts/             # Shell utilities, git hooks and repo checks
├── docker/              # Docker Compose fragments (see docker/README.md)
├── .agents/rules/       # Cursor-specific rules (also summarised below)
├── .devcontainer/       # Dev Container (Bun, Rust, Bash tooling)
├── .github/workflows/   # CI (lint, typecheck, build, test)
└── (root config)        # .oxlintrc.json, .oxfmtrc.json, lefthook.yml, etc.
```

## Tooling and commands

| Tool | Purpose | Config |
|------|---------|--------|
| **Bun** | Package manager, workspaces and task running (`bun run --filter`) | `package.json` |
| **oxlint + oxfmt** | Lint + format for TS/JS | `.oxlintrc.json` / `.oxfmtrc.json` (tabs, line width 100) |
| **Lefthook** | Git hooks (pre-commit, commit-msg) | `lefthook.yml` |
| **EditorConfig** | Consistent indent/charset/line endings | `.editorconfig` |

**Run everything from repo root:**

| Command | What it does |
|---------|-------------|
| `bun install` | Install all dependencies |
| `bun run prepare` | Install git hooks (lefthook) |
| `bun run dev` | Start all dev servers (parallel) |
| `bun run build` | Build all apps |
| `bun run lint` | Lint: oxlint (TS/JS) + ShellCheck |
| `bun run lint:fix` | Lint with auto-fix |
| `bun run format` | Format: oxfmt + shfmt + cargo fmt |
| `bun run typecheck` | TypeScript typecheck |
| `bun run test` | Run every workspace's tests (`bun test`; Vitest in the console, web and logger) |
| `bun run test:coverage` | Run TS coverage + all language tests |
| `bun run test:e2e:web` | Run web Playwright e2e tests |
| `bun run architecture:check` | Enforce architecture import boundaries + kebab-case naming |
| `bun run naming:check` | Enforce kebab-case (dotted) file/folder names |

## Conventions

### Code style

- **Formatter**: oxfmt. Tabs, line width 100. Applies to `apps/**/*.ts(x)`, `packages/**/*.ts(x)`,
  root config files. Run `bun run format` or rely on pre-commit hook.
- **No ESLint/Prettier**: oxlint + oxfmt are the only lint/format tools for TS/JS in this project.
- **Naming**: PascalCase for components; files match component name. Hooks use `use*` prefix;
  utility functions are plain named exports.
- **Imports**: Prefer workspace imports as `@grid/<package>` (e.g. `@grid/ui`).
  Group: external → workspace → relative. No unused imports.
- **Types**: Explicit types for props and public APIs. Avoid `any`; use `unknown` and narrow.
- **Errors**: Handle explicitly — log and rethrow, or use result types. No silent catches.
- **Size**: Small, single-responsibility functions and components. Extract when complexity grows.

### Project structure

- **Monorepo**: Apps in `apps/`, shared code in `packages/`. When a change applies across apps,
  prefer changing a shared package.
- **New apps**: Add under `apps/`; `bun run --filter '*'` picks up any matching script.
- **New packages**: Add under `packages/`, export via `@grid/<name>`.
- **Shared UI**: `packages/ui` uses shadcn-style components. Shared Tailwind tokens live in
  `packages/ui/src/styles/globals.css`.
- **TypeScript config**: Extend from `packages/typescript-config/base.json` (or `nextjs.json`
  for Next.js apps).

### Git and commits

- **Pre-commit hooks** (Lefthook): auto-format, lint, typecheck, large-file guard (2 MB max),
  secret scan, architecture check. Hooks run automatically if installed via `bun run prepare`.
- **Commit messages**: Enforced by `commit-msg` hook — Conventional Commits only
  (`feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`), **all lowercase**,
  10–200 chars, no WIP. Example: `feat(auth): add passkey login and shared ui forms`.
- **Do not commit**: build output (`.next/`, `dist/`, `target/`), `node_modules/`, `.env` files,
  cache dirs. These are in `.gitignore`.
- **Separate concerns**: Don't mix lint/format-only fixes with feature changes in the same commit.

### Per-language notes

| Language | Lint | Format | Test |
|----------|------|--------|------|
| **TypeScript/JS** | oxlint | oxfmt | `bun test`; Vitest (console, web, logger) |
| **Bash** | ShellCheck | shfmt | — |

### Docker

Postgres, the Grid API, and Next.js via Compose fragments under `docker/compose/`
(merged by root `docker-compose.yml`, Compose v2.20+, no `version:` key):

```bash
cp env.docker.example .env
docker compose up -d --build
```

Defaults: web `:3000`, API `:4000`, Postgres host `:5433`. Host-only API/web: start `postgres`
only, then `bun run dev`. See `/docs/docker` and `docker/README.md`.

## Before finishing any task

1. Run `bun run lint` from repo root — fix any errors.
2. Run `bun run format` from repo root — ensure formatting is clean.
3. If you changed TypeScript, run `bun run typecheck`.
4. Do not leave dead code, unused imports, or `any` types.

## Key files to read for deeper context

- `PROJECT.md` — detailed layout, tooling, and commands.
- `DESIGN.md` — design-system brief for UI generation and review.
- **Docs app** (`apps/docs`, run with `bun --cwd=apps/docs run dev`):
  - `/docs/qol` — full QoL stack (hooks, CI, per-language tools)
  - `/docs/architecture` — architecture baseline and enforceable boundaries
  - `/docs/overrides` — policy for project-specific architecture overrides
  - `/docs/docker` — Docker Compose setup
  - `/docs/deploy` — Vercel (web/docs) + Render (API) + Neon
- `.agents/skills/solid-2/SKILL.md` — Solid 2 only in `apps/console`: removed 1.x APIs, their replacements, and idioms. Read before any Solid work.
- `.agents/skills/mobile-first/SKILL.md` — Mobile-first responsive rules and checklist for all UI, especially the Solid console.
- `.agents/skills/browser-ui-test/SKILL.md` — Browser UI/UX verification via Playwright MCP + `apps/web` e2e after interactive web changes.
- `docker/README.md` — Compose fragment layout and `-f` fallback.
- `.oxlintrc.json` — oxlint config (lint rules).
- `.oxfmtrc.json` — oxfmt config (formatter settings).
- `lefthook.yml` — Git hook definitions.
