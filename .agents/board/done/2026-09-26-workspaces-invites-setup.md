---
id: str-workspaces-invites-setup
title: Workspaces: invites, first-run setup, closed signup
type: feature
from: human
to: backend
priority: high
status: done
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-workspaces-data]
branch: agent/backend/workspaces-invites-setup
worktree: ../grid-worktrees/agent/backend/workspaces-invites-setup
scope:
  - packages/db/**
  - apps/api/**
  - apps/launcher/**
  - apps/console/src/modules/auth/**
  - apps/console/src/app.tsx
  - docker/compose/grid.yml
  - apps/docs/content/docs/backend-api.mdx
  - apps/docs/content/docs/portable.mdx
  - README.md
  - PROJECT.md
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Invites by link or email with a role, accepted by signing up or signing in. First run: the launcher prints a one-time setup link with a code instead of writing `.grid/owner.txt`; the setup endpoint creates the owner account and first workspace. Public signup is closed by default on self-hosted Grid (an instance setting the owner can open); registering needs a valid invite otherwise.

## Why / Context

Second of four workspace cards. The model is in the plan's "Workspaces" section.

## Done

- **Data** (migration 0009): `instance_settings` (one row: `signup_open` false, `owner_id`, the
  hashed setup code and its expiry; the backfill makes the oldest user the owner) and
  `workspace_invites` (hashed token, optional email, role, expiry, accepted by/at).
- **First run**: `@grid/db/instance` issues the setup code; `packages/db/src/setup-code.ts`
  replaces `owner.ts`. The launcher prints `…/setup?code=…` and keeps it in
  `<data>/setup-link.txt` (mode 600, a fresh code each start until someone signs up, removed
  after); the API container entrypoint prints it too. `POST /instance/setup` creates the verified
  owner, the first workspace and the instance owner in one transaction (row lock against races),
  and signs them in. Existing `owner.txt` files are left alone.
- **Signup**: closed by default. `register` takes `inviteToken`; without one it answers 403
  `SIGNUP_CLOSED` unless the Grid owner opened signup (`PATCH /instance`). Google makes new
  accounts only while signup is open. An email invite checks the address before the account is
  made, and that account starts verified.
- **Invites**: `/workspaces/:ws/invites` (list, create by email or link, revoke; admins, never
  `owner`), `/invites/:token` (public preview, accept once when signed in; email-bound invites
  check the address). Invite emails go out through the existing sender.
- **Console**: a minimal `/setup` page (account and workspace, the slug follows the name) so a
  fresh install works before the redesign; the sign-in page points at the setup link while the
  Grid is not set up. The invite page and the members/invites UI come with the redesign
  (workspaces-console card).

## Validation

- Migration 0009 on a clone of the dev database: the settings row has signup closed and
  demo@grid.dev (oldest user) as owner.
- Fresh-install run on an empty database: code issued; `/instance` says `setupNeeded: true`; a
  wrong code 403; setup 201 with an access token, the refresh cookie and a verified user; a
  second setup 409; `/workspaces` is `acme:owner`; opening signup 200; no code issued after.
- Console `/setup` at 375px: renders; the slug follows the workspace name (`acme-inc`); submitting
  calls `/instance/setup` and shows the API's error.
- api unit tests 45 pass; console auth tests 14 pass; contract suite against this branch 72 pass, 0 fail (5 new invite/instance tests). lint, typecheck, architecture check: pass.
