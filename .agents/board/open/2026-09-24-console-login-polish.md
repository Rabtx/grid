---
id: str-console-login-polish
title: Sign-in polish: return to where you were, show password, calmer session check
type: feature
from: ui-ux
to: web
priority: normal
status: open
assignee: none
reviewer: claude
parent: .agents/plans/console-design-migration.md (UX polish round)
depends_on: []
branch: agent/web/console-login-polish
worktree: ../grid-worktrees/agent/web/console-login-polish
port: 3045
scope:
  - apps/console/src/modules/auth/components/login-form.tsx
  - apps/console/src/routes/require-auth.tsx
  - apps/console/src/app.tsx (the LoginRoute function only)
  - apps/console/src/routes/app-shell.test.tsx
allowed_shared: []
created: 2026-09-24
updated: 2026-09-24
---

## What

Signing in always lands on the board, even when you opened a task or terminal link; the password cannot be revealed on a phone; and every reload flashes "Checking your session…" text.

## Why / Context

Shared links (`/board/:slug/tasks/:n`, `/terminal/:id`) should survive a sign-in. The session check shows on every cold start of the PWA. Read first, in order: `AGENTS.md`, `DESIGN.md` ("Product tokens (console)", "Interaction"), `.agents/skills/solid-2/SKILL.md` (Solid 2 only — check `apps/console/node_modules/solid-js/types` before using any API), `.agents/skills/mobile-first/SKILL.md`, then the files in scope.

## Proposal (build exactly this)

1. `RequireAuth`: when redirecting to `/login`, pass the current path+search as `?next=`. Only same-origin relative paths are accepted (must start with `/` and not `//`); anything else falls back to `/board`.
2. `LoginRoute` and `LoginForm`: after sign-in, and when an already-signed-in visitor opens `/login`, navigate to `next` (replace).
3. Password field: a show/hide toggle button inside the field (an `IconButton` with a label that says what it does, `aria-pressed`), keeping `autocomplete="current-password"`.
4. Replace the "Checking your session…" line with the brand mark (`BrandMark` from `@/ui`) centred and softly pulsing (off under reduced motion), shown only after 300 ms so fast refreshes show nothing.
5. Tests: `next` round-trip; an off-site `next` is ignored; the toggle switches the input type.

## Scope

**In scope:** the files in `scope`.
**Out of scope:** 2FA, sign-up, password reset, the auth API. Never name any external product or project in code, comments or docs.

## Validation

Run from the worktree root and paste the real output tails into Resolution:
- `bun --cwd=apps/console run test` · `bun --cwd=apps/console run typecheck` · `bun --cwd=apps/console run build`
- `bun run lint` · `bun run format` · `bun run architecture:check`
- Ports 3000–3002, 3011, 4000 and 4100 belong to the human's running servers: do not start or stop
  anything on them. If you need a dev server, use the port on this card.
- If you run a dev server, use port 3045 (`bunx vite --port 3045 --strictPort` in `apps/console`).

## Resolution

<Filled by the resolver.>
