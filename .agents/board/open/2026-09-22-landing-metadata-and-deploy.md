---
id: str-landing-metadata-deploy
title: Give the landing page real metadata, social cards and a deploy target
type: chore
from: pm
to: web
priority: normal
status: open
assignee: none
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/landing-metadata-deploy
worktree: ../grid-worktrees/agent/web/landing-metadata-deploy
scope:
  - apps/web/src/app/**
  - apps/web/src/modules/landing/**
  - apps/web/public/**
  - apps/web/vercel.json
allowed_shared: []
created: 2026-09-22
updated: 2026-09-22
---

## What

`/` is now Grid's public landing page, but it has no Open Graph tags, no Twitter card, no
sitemap, no `robots.txt` and no canonical URL. Anyone sharing the link gets a bare link. Fix
the metadata and make sure the page deploys.

## Why / Context

The root layout at `apps/web/src/app/layout.tsx` sets only `title` and `description`. The brand
artwork now exists at `apps/web/public/brand/grid-logo.png` and `grid-mark.png`, and
`apps/web/src/app/icon.png` is the app icon, so there is something real to build a social card
from. Deploy config lives in `apps/web/vercel.json`.

Copy for the page lives in `apps/web/src/modules/landing/data/landing.data.ts` and is covered by
`landing.data.test.ts` — extend that test if you add fields.

## Proposal or Ask

1. Full metadata on `/`: `openGraph`, `twitter`, `metadataBase`, canonical, and a real OG image.
   Prefer Next's `opengraph-image` file convention over hand-rolled tags.
2. Add `sitemap.ts` and `robots.ts` using the app-router conventions.
3. Set the site URL from an environment variable with a sane fallback, and document it in
   `env.docker.example` and the deploy docs at `apps/docs/content/docs/deploy.mdx`.
4. Confirm the page still builds fully static — it is currently `○ /` in the build output, and
   it should stay that way. If metadata forces it dynamic, say so on the card rather than
   quietly shipping a server-rendered landing page.
5. Do not invent social proof. No fake customer logos, testimonials, star counts or metrics.
   Everything on this page has to be true of the repository as it stands.

**Definition of done:** the page has valid OG and Twitter tags with a rendering image, a sitemap
and robots file, still builds static, and the deploy target is documented.

## Scope

**In scope:**

- `apps/web/src/app/**`, `apps/web/src/modules/landing/**`, `apps/web/public/**`, `vercel.json`
- The deploy section of `apps/docs/content/docs/deploy.mdx`

**Out of scope:**

- Any authenticated route — `/admin/**`, `/login`, account pages
- Redesigning the landing sections; this is metadata and delivery, not a visual pass
- Analytics or third-party scripts — raise a card, it is a privacy decision, not a chore

## Validation

- `bun --cwd=apps/web run build` and paste the route table showing `/` still static
- Validate the OG tags on the built output (curl the HTML and show the meta tags)
- `bun --cwd=apps/web run test` — the landing copy test must still pass
- `bun run preflight` from the repo root

## Resolution

<!-- filled by the resolver -->
