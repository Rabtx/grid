---
id: str-hono-billing
title: Hono: billing with Stripe and Razorpay
type: feature
from: human
to: backend
priority: normal
status: review
assignee: backend
reviewer: human
parent: .agents/plans/api-on-hono.md
depends_on: [str-hono-foundation]
branch: agent/backend/hono-billing
worktree: ../grid-worktrees/agent/backend/hono-billing
scope:
  - apps/api/src/modules/billing/**
  - apps/api/test/contract/billing*
allowed_shared:
  - apps/api/src/app.ts
  - apps/api/src/main.ts
  - apps/api/package.json
  - bun.lock
created: 2026-09-26
updated: 2026-09-26
---

## What

Port `modules/billing`: plans, checkout sessions, subscription state, and Stripe and Razorpay webhooks verified against the raw request body. Keep the provider SDKs (stripe, razorpay); use Bun or WebCrypto for anything else.

## Why / Context

Parallel lane for an agent once the foundation is merged. Rules for every card are in the plan: Bun-native first, same contract, contract tests on both servers before a route switches over.

## Package additions

- Added `stripe` (^22.6.2) and `razorpay` (^2.9.8) to `apps/api/package.json`: kept existing payment provider SDKs as specified in the plan and card for checkout session creation, portal links, and webhook normalization. WebCrypto is used for Razorpay HMAC-SHA256 signature verification and Bun's WebCrypto subtle provider for Stripe async webhook construction.

## Shared files

- `apps/api/src/app.ts`: Mounted `billingRoutes` under `/api/v1/billing` and passed database instance to `AppDeps`.
- `apps/api/src/main.ts`: Passed `db: database.db` to `createApp`.
- `apps/api/package.json` & `bun.lock`: Added `stripe` and `razorpay` dependencies.

## Outcome

- Ported `modules/billing` from NestJS to Hono on Bun as plain functions:
  - `dto.ts`: Zod validation schemas for checkout and portal (`createCheckoutSchema`, `createPortalSchema`).
  - `types.ts`: Provider names, plan codes, intervals, checkout, portal, and normalized webhook types.
  - `repository.ts`: Drizzle queries over `@grid/db` schema for subscription tracking, latest lookup, customer lookup, and webhook upserting.
  - `stripe.ts`: Stripe checkout session creation, customer portal session creation, and async webhook signature verification using Stripe SDK with WebCrypto.
  - `razorpay.ts`: Razorpay checkout subscription creation, customer portal unsupported error (501 `BILLING_PORTAL_UNSUPPORTED`), and constant-time HMAC-SHA256 signature verification using WebCrypto (`crypto.subtle`).
  - `service.ts`: Provider config checks, price ID resolution, subscription lookup, checkout, portal, and webhook handling.
  - `routes.ts`: Routes mounted at `/api/v1/billing`:
    - `GET /providers`: lists configured providers without auth.
    - `GET /subscription`: returns latest user subscription (`requireUser`).
    - `POST /checkout`: validates body, resolves price, creates provider checkout session (`requireUser`).
    - `POST /portal`: validates body, creates portal link (`requireUser`).
    - `POST /webhooks/:provider`: reads raw request body once before parsing, verifies provider signatures, and updates subscriptions. Returns `{ received: false, handled: false }` for unhandled providers.
- Comprehensive unit tests in `apps/api/src/modules/billing/billing.test.ts` testing Stripe and Razorpay webhook signature verification, cancellation, unhandled events, missing user id, and DB updates.
- Contract test suite in `apps/api/test/contract/billing.test.ts` covering all routes, unauthenticated 401s, validation 400s, 503 unconfigured provider errors, and webhook handling.

## Changed

- `apps/api/package.json`
- `apps/api/src/app.ts`
- `apps/api/src/main.ts`
- `apps/api/src/modules/billing/billing.test.ts`
- `apps/api/src/modules/billing/dto.ts`
- `apps/api/src/modules/billing/razorpay.ts`
- `apps/api/src/modules/billing/repository.ts`
- `apps/api/src/modules/billing/routes.ts`
- `apps/api/src/modules/billing/service.ts`
- `apps/api/src/modules/billing/stripe.ts`
- `apps/api/src/modules/billing/types.ts`
- `apps/api/test/contract/billing.test.ts`
- `bun.lock`

## Validation

### 1. `bun run typecheck`
```
$ bun run --filter '*' typecheck
launcher typecheck: Exited with code 0
@grid/logger typecheck: Exited with code 0
runner typecheck: Exited with code 0
@grid/db typecheck: Exited with code 0
console typecheck: Exited with code 0
@grid/ui typecheck: Exited with code 0
api typecheck: Exited with code 0
web typecheck: Exited with code 0
nest-api typecheck: Exited with code 0
```

### 2. `bun run lint`
```
$ bun run --filter '*' lint && bun run scripts:lint
runner lint: Exited with code 0
launcher lint: Exited with code 0
@grid/db lint: Exited with code 0
@grid/logger lint: Exited with code 0
console lint: Exited with code 0
docs lint: Exited with code 0
api lint: Exited with code 0
@grid/ui lint: Exited with code 0
nest-api lint: Exited with code 0
web lint: Exited with code 0
$ shellcheck scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh
```

### 3. `bun run format`
```
$ oxfmt --write . && bun run scripts:format && (cd packages/logger/rust && cargo fmt || true)
Finished in 224ms on 583 files using 4 threads.
$ shfmt -i 4 -w scripts/bash/*.sh scripts/git-hooks/*.sh scripts/architecture/*.sh || true
```

### 4. `bun run architecture:check`
```
$ bash scripts/architecture/check-boundaries.sh
Running architecture boundary checks...
Architecture checks passed.
Running kebab-case naming checks...
[naming] OK (600 path(s) checked)
```

### 5. `bun --cwd=apps/api test`
```
$ bun test src
bun test v1.4.2 (744846f84)

src/modules/billing/billing.test.ts:
Ignoring razorpay webhook without userId (subscription.charged:sub_no_user_1790418593218:active)

 49 pass
 0 fail
 126 expect() calls
Ran 49 tests across 4 files. [926.00ms]
```

### 6. Contract suite against NestJS (PORT=4031)
```
$ CONTRACT_API_URL=http://127.0.0.1:4031 bun test test/contract
bun test v1.4.2 (744846f84)

 24 pass
 0 fail
 55 expect() calls
Ran 24 tests across 2 files. [499.00ms]
```

### 7. Contract suite against Hono (PORT=4032)
```
$ CONTRACT_API_URL=http://127.0.0.1:4032 bun test test/contract
bun test v1.4.2 (744846f84)

 24 pass
 0 fail
 55 expect() calls
Ran 24 tests across 2 files. [555.00ms]
```

## Contract impact

- None. Preserved exact `/api/v1/billing/*` routes, request parameters, envelope format, error codes (`BILLING_PROVIDER_NOT_CONFIGURED`, `BILLING_WEBHOOK_SIGNATURE_MISSING`, `BILLING_WEBHOOK_INVALID`, `BILLING_PRICE_NOT_CONFIGURED`, `BILLING_NO_CUSTOMER`, `BILLING_PORTAL_UNSUPPORTED`, `AUTH_REQUIRED`, `VALIDATION_ERROR`), and response payloads.

## Commit

- `15d63303d368e7ec8120fa80352c8c4cfb489be1`
