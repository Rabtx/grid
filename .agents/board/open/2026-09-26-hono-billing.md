---
id: str-hono-billing
title: Hono: billing with Stripe and Razorpay
type: feature
from: human
to: backend
priority: normal
status: ready
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-foundation]
branch: none
worktree: none
scope:
  - apps/api/src/modules/billing/**
  - apps/api/test/contract/billing*
allowed_shared: []
created: 2026-09-26
updated: 2026-09-26
---

## What

Port `modules/billing`: plans, checkout sessions, subscription state, and Stripe and Razorpay webhooks verified against the raw request body. Keep the provider SDKs (stripe, razorpay); use Bun or WebCrypto for anything else.

## Why / Context

Parallel lane for an agent once the foundation is merged. Rules for every card are in the plan: Bun-native first, same contract, contract tests on
both servers before a route switches over.
