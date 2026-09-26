---
id: str-hono-auth-core
title: Hono: users, sessions and core sign-in
type: feature
from: human
to: backend
priority: high
status: ready
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-foundation]
branch: none
worktree: none
scope:
  - apps/api/src/modules/auth/**
  - apps/api/src/modules/users/**
  - apps/api/src/modules/email/**
  - apps/api/test/contract/auth*
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Port `modules/auth` (register, login, refresh, logout, sessions list/revoke, email verification, password reset, OTP and magic link, CSRF check), `modules/users` and `modules/email`. `Bun.password` replaces bcryptjs and must verify existing bcrypt hashes. Same cookies (name, attributes, path) and the same native-client behaviour (refresh token in the body for native apps).

## Why / Context

Security-critical; owned by the lead. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.
