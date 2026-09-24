---
id: str-console-pwa
title: Make the console an installable PWA with an offline shell
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: claude
reviewer: claude
parent: none
depends_on: []
branch: agent/ui-ux/console-pwa
worktree: ../grid-worktrees/agent/ui-ux/console-pwa
scope:
  - apps/console/vite.config.ts
  - apps/console/src/pwa/**
  - apps/console/src/main.tsx
  - apps/console/src/lib/api-client.ts
  - apps/console/src/modules/shell/**
  - apps/console/src/routes/app-shell.tsx
  - apps/console/public/manifest.webmanifest
  - apps/console/package.json
  - apps/console/.env.example
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Make the console installable on phones and desktops: a service worker, a complete manifest, an
offline app shell and an in-app prompt when a new version is ready.

## Resolution

### What changed

- `vite.config.ts`: a small build plugin emits `sw.js` from `src/pwa/service-worker.js` with the
  precache list (index.html, manifest, brand icons, hashed JS/CSS) and a build id hashed from it.
  No PWA dependency added. `/api` and `/uploads` are proxied to the API in dev and `vite preview`,
  so the console talks to its own origin — no CORS, and no mixed content behind HTTPS tunnels.
- `src/pwa/service-worker.js`: precache on install, drop old `grid-shell-*` caches on activate,
  network-first navigations falling back to the cached shell, cache-first hashed assets, and API
  calls never cached.
- `src/pwa/register.ts` + `UpdateBanner`: registers in production builds only; when a new worker
  is waiting, a banner offers "Reload", which activates it and reloads once.
- `api-client.ts`: the default API URL is the page's own origin (`VITE_API_URL` still overrides).
- `manifest.webmanifest`: `id`, `orientation`, `categories`.
- `package.json`: `preview:pwa` builds and serves the production bundle on :3011.

### Validation output

```text
$ bunx vitest run
 Test Files  9 passed (9)
      Tests  49 passed (49)
$ bun run typecheck      # tsc --noEmit, clean
$ bun run lint           # console: 0 warnings; exit 0
$ bun run architecture:check
Architecture checks passed.
[naming] OK (474 path(s) checked)
```

Browser checks (Playwright on system Chromium against `preview:pwa`):

- the worker controls the page with 12 precached entries;
- sign-in through the proxied API works, the board loads (13 cards);
- offline reload of the board renders the app shell;
- after a rebuild the update banner appears, "Reload" reloads exactly once, and the banner is
  gone afterwards; first install does not reload.

### Contract impact

- none for the API. The console now expects `/api` on its own origin in dev and preview.

### Known limitation

Service workers need a secure context: `localhost` works, a LAN IP over plain HTTP does not. For
phone testing use an HTTPS tunnel (e.g. `tailscale serve`) in front of `preview:pwa`.
