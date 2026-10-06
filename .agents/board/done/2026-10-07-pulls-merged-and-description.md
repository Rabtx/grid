---
id: grid-pulls-merged-and-description
title: show merged pull requests and render pull request descriptions correctly
type: bug
from: human
to: web
priority: high
status: done
assignee: web
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

- `apps/runner/src/github/pulls.test.ts`: Added unit test simulating fake `gh` verifying merged PRs are fetched without GraphQL complexity timeouts; all 18 tests pass. Full runner suite: 457 tests across 62 files passed (`bun --cwd=apps/runner test`).
- `apps/console/src/modules/chat/lib/markdown.test.ts`: Added 4 tests verifying safe inline HTML tags, hiding HTML comments, stripping dangerous scripts/handlers/styles/URLs (XSS prevention), and safe image rendering. All 15 tests pass.
- `apps/console/src/modules/github/components/pulls-screen.test.tsx`: Added tests verifying merged pull requests appear in panel, error states render properly instead of empty list on failure, pagination notice with "Load more" button, and PR body rendering safe inline HTML while sanitising XSS. All 10 tests pass.
- Full console suite: 116 test files passed, 655 tests passed (`bun --cwd=apps/console run test`).
- Monorepo typecheck: `bun run typecheck` passed cleanly across all packages (`api`, `console`, `docs`, `launcher`, `runner`, `web`, `@grid/db`, `@grid/logger`, `@grid/ui`).
- Monorepo lint: `bun run lint` passed with 0 errors.
- Monorepo architecture & naming: `bun run architecture:check` and `bun run naming:check` passed cleanly.
- Monorepo formatting: `bun run format` passed.

## Resolution

1. **Merged pull requests listing (Runner & Console):**
   - Root cause (PM review, 2026-10-07): two problems. (1) The desktop panel never requested merged pull requests at all: it only sent `state=open` and `filter=review`. (2) When merged PRs were requested, the runner's query, which included `statusCheckRollup`, took about 8 seconds from the CLI and sometimes longer. The runner's HTTP server used Bun's default 10-second idle timeout, so slow answers had their connection reset. The console got a bodiless 502 and showed "The runner is not running." The field split below roughly halves the query (about 3.7 seconds), and the integration branch sets the runner's and API's `idleTimeout` to 120 seconds.
   - In `apps/runner/src/github/pulls.ts`:
     - Split list fields into `OPEN_LIST_FIELDS` (with `statusCheckRollup`) and `CLOSED_LIST_FIELDS` (without `statusCheckRollup`). (Kept as a speed-up: a merged list took about 15 seconds with the check status included.)
     - Added optional `limit` parameter to `PullRequests.list` (defaulting to 100).
     - Made `summary()` mapping defensive against missing or null values (`headRefName`, `headRefOid`, `labels`).
   - In `apps/runner/src/github/routes.ts`:
     - Added `limit` query parameter parsing (capped at 500) and passed to `service.list`.
   - In `apps/runner/src/github/testing/fake-gh.ts`:
     - Added emulation for `gh pr list` matching real GitHub CLI behavior when querying statusCheckRollup on non-open states.
   - In `apps/console/src/modules/github/services/pulls.service.ts`:
     - Added `limit` parameter forwarding to the runner.
   - In `apps/console/src/modules/github/components/pulls-screen.tsx`:
     - Fixed `others` effect to wait on `workspace.folders()[slug()]` before querying and to set `error()` on failure rather than silently swallowing into `[]`.
     - Added `Segmented<PullState>` on desktop panels so users can switch between Open, Merged, and Closed PRs.
     - Added pagination indicators and a "Load more" button when the count matches the fetch limit.
     - Ensured empty states are never displayed when errors occur.

2. **PR descriptions rendering GitHub HTML safely (Console):**
   - In `apps/console/src/modules/chat/lib/markdown.ts`:
     - Extended `renderMarkdown` with optional `MarkdownOptions = { allowHtml?: boolean }`.
     - When `allowHtml: true`, utilizes a parser that passes safe GitHub-supported tags (`<details>`, `<summary>`, `<img>`, `<br>`, tables, `<kbd>`, `<sub>`, `<sup>`, formatting) while strictly stripping `<script>`, `<style>`, `<iframe>`, `on*` event handlers, inline `style` attributes, and non-http(s)/relative URLs (`javascript:`, `data:`).
     - Hides HTML comments (`<!-- ... -->`).
     - Kept default behavior for chat messages (`allowHtml: false`) completely unchanged.
   - In `apps/console/src/modules/github/components/pull-document.tsx`:
     - Rendered PR description body with `renderMarkdown(current().body, { allowHtml: true })`.

3. **Pull Request:**
   - https://github.com/shabirkhan-dev/grid/pull/185
   - Commit: `884f69d` (and follow-up card update)

## PM review (2026-10-07)

- Verified in the browser: the desktop Open · Merged · Closed switch lists this repository's merged pull requests.
- Blocking issue found and fixed on the integration branch (`agent/pm/integration`): `sanitizeNode` unwrapped disallowed tags by moving their children up, and the parent's walk had already passed them, so they were never sanitised. `<u><img src="x" onerror="alert(1)"></u>` rendered with its handler intact. Children are now sanitised before any unwrap. `noscript` is forbidden. `class` keeps only the renderer's own classes (`hljs-*`, `code-block`, `code-line`, `file-chip`, `language-*`), so a description cannot apply the console's utility classes. The DOM-environment regressions are in `markdown-html.test.tsx`.

## Merged

Landed on `main` in shabirkhan-dev/grid#187 (squash `ee2e136`, 2026-10-07), with the fixes from PM review. Services rebuilt and restarted on `ee2e136`.
