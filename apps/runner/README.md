# Grid runner

The runner is Grid's execution service on the machine that holds a project's files. It starts
coding-agent CLIs and terminals, stores agent conversations, serves project file operations,
and connects paired Grid environments. The console reaches it through `/runner`; the API
still owns sign-in, projects, and board tasks.

- **Agents:** adapters turn provider protocols into one event stream. Sessions and their event
  logs are stored in SQLite, so a conversation can be reopened after a browser disconnect or
  runner restart. Settings → Agents can install or sign in supported CLIs on this machine.
- **Terminals:** Bun PTYs outlive their browser sockets. A reconnect receives missed output
  when it is still available; restarting the runner ends the running shells.
- **Files:** browse and create files or folders inside a linked project root. Path checks keep
  those operations inside that root.
- **Environments:** a home Grid can pair with another runner and relay project chats, files,
  and terminals to the machine chosen for that project.

See [Grid's project reference](../../PROJECT.md) for the data boundaries and
[portable Grid](../docs/content/docs/portable.mdx) for one-command startup and pairing.

```bash
bun --cwd=apps/runner run dev   # also started by `bun run dev` at the repo root
bun --cwd=apps/runner test
```

- Listens on `127.0.0.1:4100`, loopback only. The console reaches it through its own origin
  (`/runner`, proxied by Vite), the same way as the API, so it works over localhost, the LAN and
  an HTTPS tunnel.
- Every request and socket carries the console's access token. The runner checks it against the
  API (`GET /api/v1/auth/me` and `/api/v1/workspaces`), so it keeps no secret of its own and a
  signed-out session stops working here too.
- A request acts in a workspace: `X-Grid-Workspace: <slug>` on HTTP, `workspace` in a socket's
  hello, or the person's default workspace without either. Project folders, chats and
  environments belong to the workspace, so teammates share them; terminals, agent settings and
  notifications stay the person's own. What a runner kept per person before workspaces moves into
  that person's default workspace the first time they use it.
- `RUNNER_PROJECTS_DIR` is the runner's filesystem boundary: folder browsing, linked project roots,
  agent working directories and explicit terminal starting directories must resolve inside it,
  including through symlinks. The runner is still a trusted-machine capability: terminals and
  agents execute as the operating-system user and can reach other host paths after a shell starts.
  Only pair or expose a runner to workspace members you trust; use a separate environment when OS
  isolation is required.
- A terminal outlives its socket: the shell keeps running when a phone locks or the network
  drops. The runner keeps up to 512 KB of recent output and sends only what a reconnecting
  device missed when it can; otherwise it replays the kept output.

| Variable | Default | |
|---|---|---|
| `RUNNER_PORT` | `4100` | |
| `RUNNER_HOST` | `127.0.0.1` | Keep it on loopback; the console proxies to it. |
| `GRID_API_URL` | `http://localhost:4000` | Where tokens are verified. |
| `RUNNER_SHELL` | `$SHELL` | Started as a login shell. |
| `RUNNER_CWD` | `RUNNER_PROJECTS_DIR` | Where new terminals start; it must be inside the projects directory. |
| `RUNNER_REPLAY_BYTES` | `524288` | Output kept per terminal for reconnects. |
| `RUNNER_MAX_TERMINALS` | `16` | Per person. |
| `RUNNER_CHAT_DB` | `~/.local/share/grid/chat.db` | SQLite session and event log. |
| `RUNNER_PROJECTS_DIR` | `~/Projects` | Default location for project folders. |
| `RUNNER_OWNER` | first owner to sign in | Whose machine this is (email or user id). The runner serves only the workspaces its owner is in. |
| `RUNNER_STT_URL` | — | Voice input: any OpenAI-compatible `/audio/transcriptions` URL (hosted or a local server). |
| `RUNNER_STT_API_KEY` | — | Sent as a bearer token to that URL, if it needs one. |
| `RUNNER_STT_MODEL` | `whisper-1` | Model name for that URL. |
| `RUNNER_STT_LANGUAGE` | — | Optional language hint (`en`, `ur`…). |
| `RUNNER_STT_COMMAND` | — | Instead of a URL: a shell command; `{input}` is the recording's path, stdout is the text. |

Protocol (`/terminal` WebSocket): the client's first message is
`{"t":"hello","token","id","cols","rows"}`; a reconnect can also include an `offset` for
output it already has. The server answers `{"t":"ready"}`, then missed or kept output as binary
frames, then live output. Input goes as binary frames. Control messages are JSON
text: `{"t":"resize","cols","rows"}` from the client; `{"t":"title"}` and `{"t":"exit","code"}`
from the server. Close code 4401 means sign in again, 4404 means the terminal is gone.
HTTP: `GET /terminals`, `POST /terminals {cols, rows, cwd?}`, `DELETE /terminals/:id`.

**Voice input** (`POST /transcribe`, body = the recording): only for browsers without a speech
recogniser of their own (the console uses the device's recogniser — Android, iOS, macOS, Chrome
— when there is one). Configure one engine, e.g. a local whisper.cpp:

```bash
RUNNER_STT_COMMAND='ffmpeg -loglevel error -i {input} -ar 16000 -ac 1 -f wav - | whisper-cli -m ~/models/ggml-base.en.bin -nt -np -f -'
```
