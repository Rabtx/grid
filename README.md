# Grid

**One place to build a project with people and AI agents, from any device.** Grid brings a
project's board, files, agent conversations, and terminals into a browser-based workspace. The
work runs on a machine with the project's code: your laptop, a VPS, or a GitHub Codespace.

Grid's larger goal is an AI-native operating system for building and running a startup. Agents
are workers in the project, with visible sessions and tool activity, rather than a chat box
separate from the work. Grid can use different coding agents and does not require one AI provider
or one permanent development machine.

## The problem

A task, its code, the agent working on it, and the terminal running it often live in different
places. That makes it hard to start work with the right context, see what changed, or continue
from a phone or another computer. Grid connects those pieces around the **project folder**:

1. Open a project and find its tasks on the board.
2. Talk to an agent in that project's folder, with its actions visible in the thread.
3. Browse the files and use a terminal on the machine that holds the project.
4. Reopen the workspace on another device and catch up with the session.

A task can prefill a new agent thread. Direct run dispatch and status on the task card are still
being developed; see [What's next](#whats-next).

## What works today

| Area | Current capability |
| --- | --- |
| Projects and board | Link project folders, create and move tasks, and view each project's board. |
| Agent sessions | Talk to supported coding-agent CLIs in project threads; stream replies, tool calls, and approvals; resume stored conversations. Grid can help install and sign in agents on the execution machine. |
| Files and terminals | Browse project folders, create files and folders, and use persistent terminal sessions. The file editor is still planned. |
| Environments | Run a project on this machine or a paired Grid environment. Manage GitHub Codespaces from Grid when GitHub access is configured. |
| Phone and offline startup | Use the installable console on phone or desktop. Local snapshots make recent screens appear quickly; the app shell can reopen offline, while live agent and terminal work still needs a runner connection. |

Grid has a working development workspace, not yet the full startup operating system in its
mission. Deployment, infrastructure operations, and business management are future product
areas. The [project reference](PROJECT.md) explains the current architecture and where data
lives.

## Try Grid locally

You need [Bun](https://bun.sh) **1.4.2** and either Docker with Compose or a PostgreSQL database
set through `DATABASE_URL`.

```bash
git clone https://github.com/shabirkhan-dev/grid.git
cd grid
bun install
bun run grid
```

On first start, the launcher prints a one-time setup link (also saved in `.grid/setup-link.txt`).
Open it to create your account and your workspace; after that, people join by invite. `bun run grid` starts Postgres through Docker when `DATABASE_URL` is unset,
applies migrations, builds the console, and runs the API and runner behind one port.

For a Codespace or VPS, environment variables, pairing, and deployment steps, read the
[portable Grid guide](apps/docs/content/docs/portable.mdx). To work on individual services, see
[development commands](PROJECT.md#development-commands).

## What's next

The [open board](.agents/board/open/) tracks the next reviewable features: Project Notes,
`@` file mentions in prompts, a readable diff viewer for agent edits, and launching an agent
run directly from a task. The [agent chat plan](.agents/plans/agent-chat.md) and
[console plan](.agents/plans/console-design-migration.md) describe broader interaction work.

The [portable Grid plan](.agents/plans/portable-next.md) proposes lighter local setup and an API
migration. Some environment work described there has already shipped; the board and merged code
are the more current status. These plans are directions, not release dates.

## Repository map

| Path | Role |
| --- | --- |
| `apps/console` | Solid 2 product interface and installable PWA |
| `apps/runner` | Bun service for agents, chat sessions, terminals, project files, and environments |
| `apps/launcher` | `bun run grid`: setup and one-port gateway |
| `apps/api` | The Grid API (Hono on Bun) for identity, projects, tasks, notes, and billing |
| `apps/web` | Next.js web app; the Solid console is the active product workspace |
| `apps/docs` | Setup, API, architecture, and deployment guides |
| `packages/` | Shared tokens, UI, logging, and TypeScript configuration |
| `.agents/` | Project board, plans, ownership, and agent work rules |

Grid uses Bun workspaces. See [PROJECT.md](PROJECT.md) for development commands and technical
boundaries, [DESIGN.md](DESIGN.md) for the interface language, and [AGENTS.md](AGENTS.md) before
contributing code. Documentation source lives in `apps/docs/content/docs/`.

## License

Choose either [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-Apache-2.0).
