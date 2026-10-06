---
id: grid-pulls-merged-and-description
title: show merged pull requests and render pull request descriptions correctly
type: bug
from: human
to: web
priority: high
status: open
assignee: none
reviewer: pm
parent: none
depends_on: []
branch: agent/web/pulls-merged-and-description
worktree: /home/ghost/Projects/grid-worktrees/agent/web/pulls-merged-and-description
scope: [apps/console/src/modules/github/**, apps/runner/src/github/**]
allowed_shared: [apps/console/src/kit/pull.tsx, apps/console/src/modules/chat/lib/markdown.ts]
created: 2026-10-07
updated: 2026-10-07
---

## What

Two bugs on the Pull requests page:

1. **Merged pull requests don't show.** The owner's repository (`shabirkhan-dev/grid`) has well over 100 merged PRs, but the Merged filter shows nothing.
2. **Descriptions render raw HTML.** Some HTML in PR descriptions (for example `<details>`, `<summary>`, `<img>`, `<br>`, comments and tables) appears as text instead of being rendered.

## Why / Context

The runner lists PRs with `gh pr list --repo <repo> --state <state> --limit 100` (`apps/runner/src/github/pulls.ts` around line 357). The route validates states in `apps/runner/src/github/routes.ts`. The console side is `apps/console/src/modules/github/` (`pulls-screen.tsx`, `pull-document.tsx`). Find the real cause before fixing. Possible culprits include a JSON field that `gh` doesn't return for merged PRs, a mapping that drops `MERGED`, filtering on the console, the wrong repo being resolved for the project, and an error being swallowed into an empty list.

## Proposal or Ask

Definition of done:

- Merged (and closed) PRs list correctly for a repository with many of them, newest first. The list can page beyond 100, or at least says plainly that more exist.
- If listing fails, the screen shows the error. It never shows an empty "no pull requests" state.
- PR descriptions render GitHub-flavoured Markdown, including the inline HTML GitHub allows (`details/summary`, `img`, `br`, tables, `kbd`, `sub/sup`), **sanitised**: no scripts, event handlers, `javascript:` URLs or style injection. HTML comments are hidden.
- Reuse the existing Markdown renderer (`apps/console/src/modules/chat/lib/markdown.ts`). Extend it rather than adding a second one.

## Scope

**In scope:** the paths in `scope` and `allowed_shared` above. Touch the shared Markdown renderer only to add sanitised HTML support, and keep chat rendering unchanged.

**Out of scope:** the PR diff viewer, the "Fix with agent" flow, the split view.

## Validation

- A runner test against the fake `gh` (`apps/runner/src/github/testing/`) that fails before the fix and passes after. Console tests for the merged list and for sanitised HTML rendering, including an XSS case.
- Runner and console suites, root lint, format, typecheck and architecture checks.
- Check against the real repository in the browser: merged PRs appear and a description containing `<details>` renders. Attach screenshots to the PR.
- Do not run tests against the live API on :4000. Open a PR, record test counts here, and PM verifies before merge.

## Resolution

