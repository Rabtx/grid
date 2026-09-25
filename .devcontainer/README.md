# Dev Container

Reproducible environment for Grid: **Bun**, **Rust**, and the Bash lint/format helpers.

## How to use

1. **VS Code / Cursor**: Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension, then **Reopen in Container**.
2. **CLI**: From repo root, `devcontainer build` then `devcontainer up` (requires [Dev Container CLI](https://github.com/devcontainers/cli)).

It is one container, with Postgres installed inside it: Codespaces runs every feature (Tailscale,
SSH) and forwards every port only for a single container, which is why this is not a Compose
setup. `postCreateCommand` runs `bun install` and `bun run prepare` (git hooks). Each start,
`start.sh` joins the tailnet when there is a key, starts Postgres, updates Grid from `main` (when
the checkout is on `main` with no local changes, so a paired environment runs the same Grid as
home), and marks the workspace
ready; the `grid-service` feature then keeps Grid running (`bun run grid`, port 8080, log in
`.grid/grid.log`) for as long as the container runs, restarting it if it stops. Grid is not
started from `start.sh` itself: Codespaces kills whatever a lifecycle command leaves running. The same setup opens in GitHub
Codespaces, and `gh codespace ssh` works. Use `bun run dev`, `bun run lint`, etc. as on the host.
See `/docs/portable`.

## Pair this Codespace with your home Grid

A Grid running elsewhere (your laptop, a VPS) can drive this Codespace's terminals as an
**environment**. They meet on your Tailscale network, so nothing here is exposed publicly.

1. In the Tailscale admin console, create an auth key that is **reusable**, **ephemeral** and
   **tagged** (for example `tag:grid-env`). Allow your home Grid to reach it, and nothing else:

   ```json
   { "src": ["autogroup:member"], "dst": ["tag:grid-env:4100"], "action": "accept" }
   ```

2. Save it as a Codespaces secret named `TS_AUTH_KEY` (GitHub → Settings → Codespaces →
   Secrets), available to this repository, and rebuild the Codespace.
3. On start, `start.sh` joins the tailnet (without touching DNS or routes), and Grid starts with
   pairing on: its runner listens only on the tailnet address. In a terminal here, run
   `bun run grid:pair` to get the address and a one-time code (valid ten minutes).
4. On the home Grid, open Settings → Environments, add the address and code.

Removing the environment at home revokes its secret on both sides. Set `GRID_PAIRING=0` to keep
a tailnet-connected Codespace unpaired.

Tailscale's feature cannot log in by itself here: Codespaces hands secrets to lifecycle commands,
not to the container's entrypoint, so `start.sh` runs `tailscale up` instead.

## What’s installed

| Tool                               | Why                             |
| ---------------------------------- | ------------------------------- |
| **Bun** `1.4.2`                    | Package manager + JS/TS runtime |
| **Rust** (stable, rustfmt, clippy) | the `packages/logger` Rust side |
| **ShellCheck** + **shfmt**         | Bash script quality             |
| **Tailscale** (feature)            | Pairing with a home Grid        |

C and Lua toolchains were removed — they are not part of the product stack.

## Ports

| Port | App           |
| ---- | ------------- |
| 8080 | Grid          |
| 3000 | Web (Next.js) |
| 3002 | Docs          |
| 4000 | Nest API      |
