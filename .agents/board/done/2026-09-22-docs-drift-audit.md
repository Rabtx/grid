---
id: str-docs-drift-audit
title: Audit the docs site against the repository as it actually is now
type: chore
from: pm
to: web
priority: normal
status: done
assignee: none
reviewer: reviewer
parent: none
depends_on: []
branch: agent/web/docs-drift-audit
worktree: ../grid-worktrees/docs-drift-audit
scope:
  - apps/docs/content/**
  - apps/docs/src/**
allowed_shared: []
created: 2026-09-22
updated: 2026-09-22
---

## What

`apps/docs/content/docs/**` was written when this repository had six apps. It now has three.
Read every page against the code and fix what is no longer true.

## Why / Context

Four apps and a package were deleted in quick succession — `apps/rust`, `apps/ai-api`,
`apps/mobile`, `packages/rabtx`, plus the chat and billing surfaces in `apps/web`. The obvious
references were cleaned up as part of those removals, but nobody has since read the docs
end to end. Stale docs are worse than missing ones: an agent reading them will act on them.

Start from `apps/docs/content/docs/meta.json` and check each page in the order it lists.

## Proposal or Ask

For each page, verify against the actual tree:

- commands still exist in the relevant `package.json`
- paths still exist
- ports match `docker-compose.yml`, `env.docker.example` and the app configs
- the architecture and project-structure pages describe three apps and three packages
- the backend-api page reflects the routes in `apps/nest-api/src/modules/*/*.controller.ts`,
  including the projects and tasks endpoints, which are currently undocumented

Fix what is wrong. Delete a page only if nothing in it is salvageable, and say why. Do not
write new feature documentation — this is an accuracy pass, not an expansion.

**Definition of done:** every page in the nav is accurate, and the Resolution lists what was
wrong on each one.

## Working agreement

Work in your own git worktree, not in the shared checkout:

```bash
git worktree add ../grid-worktrees/docs-drift-audit -b agent/web/docs-drift-audit
cd ../grid-worktrees/docs-drift-audit
bun install
```

Another agent is currently updating dependencies in the main checkout. Do not edit
`package.json` or `bun.lock` unless this card says to, and do not commit anything you did not
change. Stage explicit paths — never `git add -A`.

## Validation

- `bun --cwd=apps/docs run build`
- For each claim you kept, the command or path you checked it against
- A list, page by page, of what was stale and what you did about it

## Resolution

Done in `b4eec62`. Nine pages plus a stale comment in `apps/docs/src/app/global.css`.

`backend-api.mdx` described the API as a stub with only health and Swagger; it now documents all
eight projects and tasks routes. `project-structure.mdx` and `index.mdx` still listed `apps/mobile`,
`apps/rust` and an `apps/hono-api` that never existed here. `quick-start.mdx` gained the three real
apps and their ports.

Verified on review: the route table matches the decorators in `projects.controller.ts` including the
201 and 204 codes, the documented ports match the app configs, the docs build compiles and type
checks, and no stale app or package names remain in the content. The assignee's own validation had
skipped the docs build, which the card required.
