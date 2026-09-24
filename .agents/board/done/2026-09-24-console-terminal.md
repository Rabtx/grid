---
id: str-console-terminal
title: Terminal access in the console — shells on this machine, smooth on phones
type: feature
from: human
to: web
priority: high
status: done
assignee: claude
reviewer: claude
parent: none
depends_on: []
branch: agent/web/console-terminal
worktree: ../grid-worktrees/agent/web/console-terminal
scope:
  - apps/runner/**
  - apps/console/src/modules/terminal/**
  - apps/console/src/modules/auth/context/auth-context.tsx
  - apps/console/src/modules/shell/components/project-nav.tsx
  - apps/console/src/modules/shell/components/workspace-header.tsx
  - apps/console/src/app.tsx
  - apps/console/src/ui/icons.tsx
  - apps/console/src/pwa/service-worker.js
  - apps/console/vite.config.ts
  - apps/console/index.html
  - apps/console/package.json
  - package.json
  - .agents/ownership.yaml
  - AGENTS.md
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Top priority from the human: use Grid instead of a separate agent app for terminal work. Open
shells on the machine from the console — desktop and phone — with an experience that feels
native rather than the usual cramped web terminal.

## Resolution

### Architecture

- **`apps/runner`** (new, Bun, no runtime dependencies): owns the shells. Bun 1.4's built-in PTY
  (`Bun.spawn({ terminal })`) instead of node-pty. Listens on loopback `:4100`; the console
  reaches it through its own origin at `/runner` (Vite proxy, WebSocket included), so it works on
  localhost, the LAN and over Tailscale HTTPS. Tokens are checked against the API's `/auth/me`
  (no shared secret; a revoked session stops working). Terminals are per person, outlive their
  socket, and replay the last 512 KB on reconnect. See `apps/runner/README.md`.
- **Console `modules/terminal`**: xterm.js 6 (fit, WebGL with DOM fallback, clickable links),
  lazy-loaded so the board's bundle is unchanged (~84 KB; the terminal chunk is ~122 KB gzip).
  Tabs of terminals at `/terminal/:id`; opening the screen with none starts one.

### The phone experience

- The screen is sized to the *visual* viewport, so the prompt stays above the on-screen keyboard
  (`interactive-widget=resizes-content` on Android, `visualViewport` everywhere).
- A key bar on touch devices: esc, tab, sticky ctrl/alt (apply to the next key, typed there or on
  the keyboard), arrows (application cursor mode aware, for vim/less), `| / - ~`, paste. Its
  buttons never take focus, so the keyboard stays up.
- Autocorrect/autocapitalise off; text size A−/A+ remembered per device.
- Reconnects by itself with backoff, and at once when the page comes back or the network does;
  typing made while offline is sent after the reattach. When the runner refuses an expired token,
  the console renews it once (new `auth.renew()`), and only a refused refresh signs out.

### Also

- The theme follows Settings → Appearance live (colours resolved from the tokens).
- CI never ran the console's tests; `test:coverage` now runs the console and the runner suites.
- The board-only header is hidden on other screens.

### Validation output

```text
$ bun test            # apps/runner, real shell over a real WebSocket included
 15 pass
 0 fail
Ran 15 tests across 3 files.
$ bunx vitest run     # apps/console
      Tests  80 passed (80)
$ bun run typecheck   # console + runner: clean
$ bunx oxlint .       # console + runner: 0 warnings
$ bun run build       # console
dist/assets/index-85G8JNyJ.js         83.65 kB │ gzip:  26.77 kB
dist/assets/terminal-D5xBZXfQ.js     464.91 kB │ gzip: 121.60 kB
$ curl localhost:3001/runner/health            → {"ok":true}
$ curl localhost:3001/runner/terminals         → 401 (no token)
```

### Browser check

Signed-in UI not driven by the reviewer (agents may not enter passwords). The human checks it
on the phone PWA and the desktop.

### Contract impact

- New service `apps/runner` (port 4100). No API change: it reads `GET /api/v1/auth/me`.

### Known limitations

- Restarting the runner ends every shell (they are its children).
- Selecting text by touch in xterm is limited; paste works from the key bar and system menu.
