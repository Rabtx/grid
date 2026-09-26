---
id: str-hono-sign-in-methods
title: Hono: 2FA, passkeys and Google sign-in
type: feature
from: human
to: backend
priority: normal
status: backlog
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-auth-core]
branch: none
worktree: none
scope:
  - apps/api/src/modules/mfa/**
  - apps/api/src/modules/passkeys/**
  - apps/api/src/modules/social-auth/**
  - apps/api/test/contract/mfa*
  - apps/api/test/contract/passkeys*
  - apps/api/test/contract/social*
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Port `modules/mfa` (TOTP, recovery codes, the login challenge), `modules/passkeys` (WebAuthn registration and sign-in) and `modules/social-auth` (Google). They finish sign-in by issuing a session, so they need auth-core's session code.

## Why / Context

After auth-core lands. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.
