---
id: str-figma-front-door
title: Brand, splash, sign in and setup match the Figma 00 Brand and 01 Auth pages
type: feature
from: human
to: ui-ux
priority: high
status: done
assignee: ui-ux
reviewer: reviewer
parent: none
depends_on: [str-figma-inbox]
branch: agent/ui-ux/figma-brand
worktree: none
scope:
  - apps/console/index.html
  - apps/console/public/brand/**
  - apps/console/public/agents/**
  - apps/console/src/main.tsx
  - apps/console/src/app.tsx
  - apps/console/src/kit/**
  - apps/console/src/lib/webauthn.ts
  - apps/console/src/lib/boot-splash.ts
  - apps/console/src/modules/auth/**
  - apps/console/src/modules/workspaces/components/invite-screen.tsx
  - apps/console/src/routes/require-auth.tsx
  - apps/console/src/routes/app-shell.test.tsx
  - packages/tokens/src/kit.css
allowed_shared:
  - packages/tokens/src/kit.css
created: 2026-10-02
updated: 2026-10-02
---

## What

The front door to the Figma design, in the order the human asked: the new logo and splash, then
sign in, then the four setup steps.

## Why / Context

The human asked to go screen by screen from the splash, through auth and onboarding, before the app.

## Scope

**Out of scope:** uploading a workspace icon image (the API stores an icon id and colour only, so
the setup step shows the mark drawn from the name); conditional passkey autofill.

## Validation

- Console typecheck, lint, tests, build; Chromium at 1440 and 390, light and dark.

## Resolution

**Changed**

- Brand: Figma Logo/Grid Mark and Wordmark as inline SVG in the kit (ink and accent follow the
  theme); app icons, favicon (SVG with a dark variant, PNG fallback) and shortcut icons rebuilt
  from the Figma mark; agent logos (Claude Code, Codex, opencode, Antigravity) from 00 · Brand.
- Splash: a static one in index.html until the app draws, then the kit `Splash` while the
  session is checked ("Connecting to <workspace>…"), joined without a blank gap.
- Sign in (02): card on desktop, sheet on phones; email → password (with a hidden username for
  password managers) → two-factor; "Sign in with a passkey" through a new WebAuthn helper against
  the existing API (no email sent, discoverable passkeys); friendly errors for cancel and unknown
  passkeys.
- Setup (03–06): owner account (username derived from the email), workspace name and address,
  connect a machine (this machine / pair / Codespace), pick the first agent (sets the chat's first
  agent); reload-safe; skip and back on each later step.
- Kit: `AuthFrame`, `AuthCard`, `AuthHead`, pill `Input`/`PasswordInput`/`Field`, Button `xl`
  (44px), `ChoiceCards`, `AgentLogo`, `surface-recessed`, `surface-auth`, `--kit-field`. Invites
  use the same card.

**Validation** — typecheck clean; lint 0 errors; 71 files / 467 tests (new setup tests, passkey
success and cancel); build OK; Chromium screenshots of splash, sign in (both steps) and all four
setup steps, desktop and phone, light and dark; no page errors.

**Contract impact** — none (existing endpoints only).

**Review** — independent reviewer agent: no blockers; 6 medium (setup reload showed the link
screen, autofocus on later steps, password managers, passkey sent the email, workspace step
reachable without an account, agent step could stick) and lows (splash gap, dark favicon, a11y,
Button size via class). All fixed except: any signed-in user can open /setup's machine and agent
steps (harmless; left), and kit pieces not yet in /design (next pass on the gallery).
