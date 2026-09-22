---
id: str-landing-metadata-deploy
title: Give the landing page real metadata, social cards and a deploy target
type: chore
from: pm
to: web
priority: normal
status: done
assignee: web
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/landing-metadata
worktree: ../grid-worktrees/landing-meta
scope:
  - apps/web/src/app/**
  - apps/web/src/modules/landing/**
  - apps/web/public/**
  - apps/web/vercel.json
  - env.docker.example
  - apps/docs/content/docs/deploy.mdx
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

Implemented on branch `agent/web/landing-metadata` in worktree `../grid-worktrees/landing-meta`.

**Changes:**

- `apps/web/src/app/site.ts` — `SITE_URL` from `NEXT_PUBLIC_SITE_URL` (trailing-slash trimmed, fallback `http://localhost:3000`)
- `apps/web/src/app/layout.tsx` — `metadataBase`, `applicationName`, site-wide `openGraph` + `twitter` (`summary_large_image`)
- `apps/web/src/app/page.tsx` — `alternates.canonical: "/"`, landing `openGraph`/`twitter` title + description from `SITE`
- `apps/web/src/app/opengraph-image.tsx` — `ImageResponse` 1200×630 using `public/brand/grid-mark.png` + `SITE` copy
- `apps/web/src/app/sitemap.ts` — single entry for site root
- `apps/web/src/app/robots.ts` — allow `/`, disallow `/admin/`, `/login`, `/register`, `/api/`, sitemap link
- `env.docker.example` — documented `NEXT_PUBLIC_SITE_URL`
- `apps/docs/content/docs/deploy.mdx` — Vercel env table row + checklist item for `NEXT_PUBLIC_SITE_URL`
- `landing.data.ts` unchanged (no new fields; landing copy test untouched and passing)

**Evidence:**

`bun --cwd=apps/web run build` route table:

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /account/security
├ ○ /admin
├ ○ /admin/account/profile
├ ○ /admin/account/security
├ ○ /admin/board
├ ○ /forgot-password
├ ○ /icon.png
├ ○ /login
├ ○ /magic-link
├ ○ /opengraph-image
├ ○ /register
├ ○ /reset-password
├ ○ /robots.txt
├ ○ /sitemap.xml
└ ○ /verify-email

○  (Static)  prerendered as static content
```

`/` remains **static (`○`)**; `opengraph-image`, `robots.txt` and `sitemap.xml` also static.

Built HTML head (`apps/web/.next/server/app/index.html`):

```html
<meta property="og:title" content="Grid — An AI-native operating system for building and running a startup"/>
<meta property="og:description" content="Grid brings projects, agents, development, deployment, infrastructure and operations into one browser-accessible control plane. Humans and AI agents are both first-class workers inside it."/>
<meta property="og:url" content="http://localhost:3000"/>
<meta property="og:image" content="http://localhost:3000/opengraph-image?8f12275addc85f91"/>
<meta property="og:image:type" content="image/png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="Grid — An AI-native operating system for building and running a startup"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="Grid — An AI-native operating system for building and running a startup"/>
<meta name="twitter:description" content="Grid brings projects, agents, development, deployment, infrastructure and operations into one browser-accessible control plane. Humans and AI agents are both first-class workers inside it."/>
<meta name="twitter:image" content="http://localhost:3000/opengraph-image?8f12275addc85f91"/>
<meta name="twitter:image:width" content="1200"/>
<meta name="twitter:image:height" content="630"/>
<link rel="canonical" href="http://localhost:3000"/>
```

OG PNG generated at build: `opengraph-image.body` 47572 bytes, magic `\x89PNG`.

`robots.txt`:

```
User-Agent: *
Allow: /
Disallow: /admin/
Disallow: /login
Disallow: /register
Disallow: /api/

Sitemap: http://localhost:3000/sitemap.xml
```

`sitemap.xml`: single `<loc>http://localhost:3000</loc>`.

`bun --cwd=apps/web run test`:

```
 Test Files  5 passed (5)
      Tests  23 passed (23)
```

`bun run preflight`: lint + typecheck + tests all green (ruff `EXE001` on `scripts/python/main.py` is pre-existing on the base commit and non-fatal via `|| true`).

### Review note

Verified on review rather than taken from the report: `/` is still `○` static in the build route
table, and so are `/opengraph-image`, `/robots.txt` and `/sitemap.xml`. The emitted HTML carries
canonical, og:title/description/url/image with width, height and alt, and a
`twitter:card=summary_large_image`, all sourced from `SITE` rather than invented copy.

`robots.txt` disallows `/admin/`, `/login`, `/register` and `/api/`, which the card did not ask for
and is right. `SITE_URL` strips trailing slashes, and `deploy.mdx` now amends the existing
"NEXT_PUBLIC_* is baked at build time" line to cover the site URL — that is the footgun here, since
an unset variable bakes localhost into production OG tags.

preflight 5/5+4/4+3/3 and build 3/3.
