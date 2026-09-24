# runner

The part of Grid that runs on a machine: today, terminals. A small Bun service with no runtime
dependencies. Shells run on Bun's built-in PTY (`Bun.spawn({ terminal })`), and the console
attaches to them over a WebSocket.

```bash
bun --cwd=apps/runner run dev   # also started by `bun run dev` at the repo root
bun --cwd=apps/runner test
```

- Listens on `127.0.0.1:4100`, loopback only. The console reaches it through its own origin
  (`/runner`, proxied by Vite), the same way as the API, so it works over localhost, the LAN and
  an HTTPS tunnel.
- Every request and socket carries the console's access token. The runner checks it against the
  API (`GET /api/v1/auth/me`), so it keeps no secret of its own and a signed-out session stops
  working here too. Terminals belong to the person who opened them.
- A terminal outlives its socket: the shell keeps running when a phone locks or the network
  drops, and the last output (512 KB) is replayed on reconnect. Restarting the runner ends all
  shells.

| Variable | Default | |
|---|---|---|
| `RUNNER_PORT` | `4100` | |
| `RUNNER_HOST` | `127.0.0.1` | Keep it on loopback; the console proxies to it. |
| `GRID_API_URL` | `http://localhost:4000` | Where tokens are verified. |
| `RUNNER_SHELL` | `$SHELL` | Started as a login shell. |
| `RUNNER_CWD` | home directory | Where new terminals start. |
| `RUNNER_REPLAY_BYTES` | `524288` | Output kept per terminal for reconnects. |
| `RUNNER_MAX_TERMINALS` | `16` | Per person. |
| `RUNNER_STT_URL` | — | Voice input: any OpenAI-compatible `/audio/transcriptions` URL (hosted or a local server). |
| `RUNNER_STT_API_KEY` | — | Sent as a bearer token to that URL, if it needs one. |
| `RUNNER_STT_MODEL` | `whisper-1` | Model name for that URL. |
| `RUNNER_STT_LANGUAGE` | — | Optional language hint (`en`, `ur`…). |
| `RUNNER_STT_COMMAND` | — | Instead of a URL: a shell command; `{input}` is the recording's path, stdout is the text. |

Protocol (`/terminal` WebSocket): the client's first message is
`{"t":"hello","token","id","cols","rows"}`. The server answers `{"t":"ready"}`, then the recent
output as binary frames, then live output. Input goes as binary frames. Control messages are JSON
text: `{"t":"resize","cols","rows"}` from the client; `{"t":"title"}` and `{"t":"exit","code"}`
from the server. Close code 4401 means sign in again, 4404 means the terminal is gone.
HTTP: `GET /terminals`, `POST /terminals {cols, rows, cwd?}`, `DELETE /terminals/:id`.

**Voice input** (`POST /transcribe`, body = the recording): only for browsers without a speech
recogniser of their own (the console uses the device's recogniser — Android, iOS, macOS, Chrome
— when there is one). Configure one engine, e.g. a local whisper.cpp:

```bash
RUNNER_STT_COMMAND='ffmpeg -loglevel error -i {input} -ar 16000 -ac 1 -f wav - | whisper-cli -m ~/models/ggml-base.en.bin -nt -np -f -'
```
