---
id: str-web-blog-ai-era-ui
title: add a blog to the web app with a ui/ux in the ai era post and cheat sheet
type: feature
from: human
to: web
priority: normal
status: done
assignee: web
reviewer: none
parent: none
depends_on: []
branch: ccr-9a141bb2-kb6lt8
worktree: none
scope: ["apps/web/**"]
allowed_shared: []
created: 2026-10-12
updated: 2026-10-12
---

## What

A `/blog` section on the marketing site and a first post: UI/UX design tips, tricks and skills
for the AI era, a showcase of real Grid console screens, a live app UI cheat sheet and Hugeicons.

## Why / Context

Requested by the owner. Screens come from `.github/assets` (real console captures). Frames from
the rabtx DS Figma file (`Dx4ZZ1v693wRzVDKzunhQA`) could not be downloaded: the session's
network policy denies `www.figma.com`. School OS and Personal OS screens wait on Figma links.

## Scope

**In scope:** `apps/web/src/modules/blog/**`, `apps/web/src/app/blog/**`,
`apps/web/public/blog/**`, header/footer links, sitemap.

**Out of scope:** console, shared packages.

## Validation

- `bun --cwd=apps/web run lint` — 0 errors (4 pre-existing warnings)
- `bun --cwd=apps/web run typecheck` — clean
- `bun --cwd=apps/web run test` — 3 files, 15 tests passed
- `bun --cwd=apps/web run build` — `/blog` static, `/blog/ui-ux-design-in-the-ai-era` SSG
- `bun run architecture:check` — passed
- Playwright on `next start`: no horizontal scroll at 1280/375/320; no broken images in light
  or dark; unknown slug returns 404; sitemap lists both blog URLs

## Resolution

Shipped on `ccr-9a141bb2-kb6lt8`.
