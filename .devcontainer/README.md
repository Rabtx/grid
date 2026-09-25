# Dev Container

Reproducible environment for Grid: **Bun**, **Rust**, and the Bash lint/format helpers.

## How to use

1. **VS Code / Cursor**: Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension, then **Reopen in Container**.
2. **CLI**: From repo root, `devcontainer build` then `devcontainer up` (requires [Dev Container CLI](https://github.com/devcontainers/cli)).

The container comes with its own Postgres (`compose.yml`). After start, `postCreateCommand` runs `bun install` and `bun run prepare` (git hooks), and on attach Grid itself starts in the background (`bun run grid`, port 8080, log in `.grid/grid.log`) — the same setup opens in GitHub Codespaces. Use `bun run dev`, `bun run lint`, etc. as on the host. See `/docs/portable`.

## What’s installed

| Tool                               | Why                             |
| ---------------------------------- | ------------------------------- |
| **Bun** `1.4.2`                    | Package manager + JS/TS runtime |
| **Rust** (stable, rustfmt, clippy) | the `packages/logger` Rust side |
| **ShellCheck** + **shfmt**         | Bash script quality             |

C and Lua toolchains were removed — they are not part of the product stack.

## Ports

| Port | App           |
| ---- | ------------- |
| 8080 | Grid          |
| 3000 | Web (Next.js) |
| 3002 | Docs          |
| 4000 | Nest API      |
