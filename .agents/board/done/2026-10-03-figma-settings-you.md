---
id: str-figma-settings-you
title: Settings match the Figma 24 "You" frames — home, profile, notifications, appearance
type: feature
from: human
to: web
priority: high
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/figma-settings-you
worktree: none
scope:
  - apps/runner/src/prefs/**
  - apps/runner/src/push/**
  - apps/runner/src/agents/**
  - apps/runner/src/chat/hub.ts
  - apps/runner/src/chat/chat.test.ts
  - apps/runner/src/main.ts
  - apps/runner/src/server.ts
  - apps/api/src/modules/profiles/routes.ts
  - apps/console/src/modules/settings/**
  - apps/console/src/kit/settings.tsx
  - apps/console/src/kit/select.tsx
  - apps/console/src/kit/avatar.tsx
  - apps/console/src/kit/nav.tsx
  - apps/console/src/kit/frame.tsx
  - apps/console/src/kit/icons.tsx
  - apps/console/src/kit/index.ts
  - apps/console/src/lib/appearance.ts
  - apps/console/src/lib/chime.ts
  - apps/console/src/lib/webauthn.ts
  - apps/console/src/modules/inbox/stores/inbox.ts
  - apps/console/src/modules/chat/lib/celebrate.ts
  - apps/console/src/modules/shell/components/**
  - apps/console/src/pwa/service-worker.js
  - apps/console/src/styles/global.css
  - apps/console/src/app.tsx
  - packages/tokens/src/kit.css
created: 2026-10-03
updated: 2026-10-03
---

## What

The first part of Figma "24 · Settings": the settings shell (sidebar groups You / Workspace / Agents,
the phone's settings home) and the "You" pages — Profile, Notifications and Appearance — on desktop
and phones, with the backend each needs. Workspace (General, Members, Connectors) and Agents
(Agents & permissions, Roles, Machines) follow in their own cards.

## Scope

**Left for later:** email delivery (the Email column and the morning digest are saved, but the
runner has no mailer to send them yet); agent cursors are saved for Browser and Notes, which do not
draw cursors yet. Worktrees and Diagnostics stay under Agents until the Machines page takes them in.

## Resolution

**Runner** — each person's settings (`/prefs`): who agents commit as (name and email from the
profile, credit the agent, SSH-signed commits with this machine's key) given to agent processes
as `GIT_*` environment, and a first-message note when crediting is off; where updates reach them
(desktop and phone devices per kind: approvals, questions, runs, reviews, following), quiet hours
in their zone with approvals let through and weekends, held updates sent together after. Devices
are named from their browser (`/push/devices`) and tested one by one; an approval's notification
carries Allow and Deny answered from a locked phone with a one-time token (`/push/act`); review
requests notify once. **API** — the profile says when the password last changed.

**Console** — settings pages use the shell's top bar (Settings / Page, Saved automatically, ⋯) and
a 720px column. Profile: photo, name, username, verified email, time zone, Git identity, password,
two-factor (QR, code, recovery codes), passkeys and sessions (sign out one or the others). Notifications:
the channel table, quiet hours and devices with tests. Appearance: theme cards, the selection accent,
text size, density, code font, rail labels, reduce motion, agent cursors, sounds (a chime when the
Inbox grows) and celebrations; the colour sliders, button colour and shape controls stay. Phones:
the settings home (profile card, groups with what each says now) and drill-in rows with sheets.
Kit: settings rows, channel table, theme cards, swatches, pill and value selects; avatars show photos
and two initials.

## Validation

- `bun run lint` 0, `bun run typecheck` 0, `vite build` OK.
- Console vitest 86 files / 544 tests (new: profile ×4, notifications ×3, appearance accent and
  rail/motion).
- Runner 354 pass (new: prefs store/patch/HTTP, quiet hours, git environment and key, channel
  routing, quiet hold and flush, device test, review once, act token, push routes, hub env and note).
- API 28 pass.
- Chromium against this branch's API and runner (a copy of the runner database): desktop Profile,
  Notifications, Appearance (rail labels on), phone settings home, Profile, Notifications and
  Appearance.
