---
id: str-console-mobile-shell-board
title: Mobile-first console shell and board
type: feature
from: human
to: web
priority: high
status: done
assignee: claude (part 1), claude (part 2)
reviewer: claude
parent: none
depends_on: [str-console-design-foundation, str-console-audit-gaps]
branch: agent/web/console-mobile-shell-board
worktree: ../grid-worktrees/agent/web/console-mobile-shell-board
scope:
  - apps/console/src/**
  - apps/console/index.html
allowed_shared: []
created: 2026-09-23
updated: 2026-09-23
---

## What

Rebuild the console's app shell and board **mobile first** on the product tokens: a phone layout
with a top bar and navigation drawer that grows into a persistent sidebar on desktop, and a board
that shows one stage at a time on phones (swipe or tabs) and all stages as columns from tablet up —
**one component tree, one markup, breakpoint prefixes only**.

## Why / Context

The console is Grid's product and a phone is a real control surface for it. The token layer
(`packages/tokens/src/product.css`, see DESIGN.md → "Product tokens (console)") and the
component-test setup (`apps/console/vitest.config.ts`: every `*.test.tsx` runs in the `dom` project on happy-dom, every `*.test.ts` in the `logic` project on node) are already merged.

Read first: `AGENTS.md`, `DESIGN.md`, `.agents/skills/mobile-first/SKILL.md` (binding),
`.agents/skills/solid-2/SKILL.md` (binding), then all of `apps/console/src/**` and
`packages/tokens/src/product.css`.

## Proposal (design decisions are made — implement them)

Use only the product tokens: `text-ui*` / `text-title` sizes, `bg-background|card|muted|accent`,
`text-foreground|muted-foreground`, the subtle/status colours, `border-border`, `h-control` /
`h-row` style density tokens, `duration-fast|base|slow` with the grid easings. `tokens.test.ts`
must stay green. No new dependencies — overlays use the native `<dialog>` element
(`showModal()` gives focus trapping, Esc and a backdrop for free).

### Routes

- `/board/:slug` shows a project's board; `/` and `/board` redirect (replace) to the first
  project's slug once projects load; unknown slug → an inline "Project not found" state with a
  link back. Selected project lives in the URL (shareable), replacing the `<select>` and the
  `selectedSlug` signal. Use the installed `@solidjs/router` API (README in node_modules) for
  params and navigation.

### App shell (`src/routes/app-shell.tsx`, split into small components under `src/modules/shell/`)

Signed-out (login) keeps a minimal centred layout with just the brand.

Signed-in, **phone (default, < lg)**:
- Sticky top bar, `h-14`, padded for the notch (`pt-[env(safe-area-inset-top)]`), `bg-background/85`
  with `backdrop-blur` and a bottom border: a 44px menu button (left) → opens the drawer; the
  current project name (truncate) as the title; a 44px "New task" icon button (right).
- Drawer: a `<dialog>` sliding in from the left (`duration-slow ease-out-grid`), width
  `min(20rem, calc(100vw - 3rem))`, full height (`h-dvh`), padded for safe areas. Contents, top to
  bottom: brand "Grid"; "Projects" list (each a link to `/board/:slug`, 44px rows, current one
  `aria-current="page"` with `bg-accent`); spacer; the signed-in email (`text-ui-sm
  text-muted-foreground`, truncate) and "Sign out". Closes on backdrop click, Esc, and after
  navigating.

**Desktop (lg and up)**: the top bar is hidden (`lg:hidden`); the same navigation renders as a
persistent `aside` sidebar (`hidden lg:flex`, `w-60`, `bg-muted` = surface-1, right border) —
reuse one `ProjectNav` component for both drawer and sidebar. The main area gets its own header
row: project name (`text-title`) + task count, and the "New task" button with a text label.

Main content: `px-4 md:px-6 lg:px-8`, `pb-[env(safe-area-inset-bottom)]`.

### Board (`src/modules/projects/components/`)

One lanes container for every width:

- Container: `flex overflow-x-auto snap-x snap-mandatory scroll-smooth` (motion-safe only).
- Lane: `w-full shrink-0 snap-start md:w-72 md:snap-align-none`; from `md:` lanes sit side by
  side as columns and the container scrolls sideways normally. Lanes have a header (status dot in
  `bg-status-<name>`, label, count) and a vertical list of task cards; on phones the lane body
  scrolls with the page.
- **Stage tabs, phone only** (`md:hidden`): a horizontally scrollable row above the lanes, one
  44px button per stage with its dot and count. Tapping scrolls that lane into view
  (`scrollIntoView({ inline: "start" })`); an `IntersectionObserver` on the lanes keeps the active
  tab in sync while swiping, and scrolls the active tab into view. `aria-current="true"` on the
  active tab; each tab `aria-controls` its lane `id`.
- Task card (`article`, `bg-card`, border, radius): key in `font-mono text-ui-xs text-subtle`,
  title `text-ui` (wraps, never overflows), owner badge (`text-ui-xs`), branch in
  `font-mono text-ui-xs` truncate. Full width on phones, lane width on desktop. Not clickable yet —
  no hover-only affordances.
- Empty lane: a quiet "No tasks" line, not an illustration.

### New task

"New task" (top bar icon on phones, labelled button on desktop) opens one `<dialog>`: a **bottom
sheet on phones** (anchored bottom, full width, `rounded-t-xl`, slides up, padded for the home
indicator) and a **centred dialog from `md:`** (`md:max-w-md md:rounded-xl`). It holds the title
input (`text-ui-input`, `enterkeyhint="done"`, autofocus on open, maxlength 200), a submit button
("Add to backlog", pending label "Adding…"), and an inline error line. On success: close, clear,
and refresh the tasks (keep the revision-counter approach or use `refresh()` — either is fine,
but tell in Resolution which and why).

### States (all must fit a 320px screen)

- First load: `<Loading>` fallback with skeleton lanes (3 on phones via tabs area + one lane; 4
  columns from md) using `bg-muted` blocks and `animate-pulse` (motion-safe).
- Switching project: keep the old board visible and show a 2px progress bar at the top of the main
  area while `isPending(() => tasks())` is true (the audit's missing indicator).
- Errors: wrap the board in `<Errored fallback={(err, reset) => …}>` with the message and a
  "Try again" button.
- No projects: "No projects yet" with a one-line explanation.
- Long titles, long branch names and long emails wrap or truncate — never cause horizontal page
  scroll.

### Tests (`*.test.tsx` run in happy-dom automatically — no per-file comment)

- Pure logic you extract (e.g. resolving the active project from projects + URL slug) gets a
  plain unit test.
- A component test for the board: stub `fetch` for projects/tasks, render inside the router +
  `AuthProvider` like `login-form.test.tsx` does, and assert the stage tabs and lane headings
  render with correct counts.

## Scope

**In scope:** `apps/console/src/**`, `apps/console/index.html`. **Out of scope:** tokens
(`packages/tokens` — raise it in Resolution if a token is missing instead of inventing values),
`apps/web`, `apps/nest-api`, `packages/ui`. Do not name any external product or project anywhere.

## Validation

Run from the worktree root and paste the real output tails into Resolution:

- `bun --cwd=apps/console run test`, `typecheck`, `build`
- `bun run lint`, `bun run format`, `bun run architecture:check`
- `grep -rnE "max-(sm|md|lg|xl):" apps/console/src` — every hit justified in Resolution (ideally none)

## Resolution

### Part 1 — routes, shell, new-task sheet (done, 2026-09-23)

History: an agy (gemini-3.8-flash-high) run died on a network error without writing anything; an
opencode (nemotron-3-ultra-free) run produced a shell after 40 minutes that could not work (the
drawer rendered `null` while closed so its `<dialog>` never existed, projects were fetched twice,
the header count was hard-coded to 0, casts hid type errors). Claude rewrote the wiring, keeping
the visual markup ideas.

- `WorkspaceProvider` (`modules/projects/context/workspace-context.tsx`) owns the project list, the
  active slug (`useMatch("/board/:slug")` in the root layout), the active project, its tasks, a
  revision-counter refresh (kept: the dependency stays visible in the memo) and the new-task open
  state. Shell and board read one copy.
- Routes: `/board/:slug`; `/` and `/board` render `ProjectRedirect` (replace-navigates to the first
  project, or "No projects yet"); unknown slug → "Project not found" with a link back.
- Shell (`modules/shell/`): phone `TopBar` (menu, project name, New task — 44px targets, safe-area
  top), `NavDrawer` (always-mounted modal `<dialog>`, slides in with `starting:`/`transition-discrete`,
  closes on backdrop, Escape and navigation), desktop sidebar (`hidden lg:block`) and
  `WorkspaceHeader` (name, live task count, labelled New task). `ProjectNav` is shared by drawer and
  sidebar; links are plain anchors the router intercepts.
- New task: `NewTaskDialog` — bottom sheet on phones, centred from `md:`, 16px input, closes and
  refreshes the board on success. Moved into part 1 because it is shell plumbing; the old inline form
  and the project `<select>` are gone.
- Lint: the backdrop-click handler on both dialogs carries an `oxlint-disable-next-line` for
  `click-events-have-key-events` / `no-noninteractive-element-interactions` — Escape is handled by
  the modal dialog natively. Follow-up (out of scope, root config): `.oxlintrc.json` applies the
  react and nextjs plugins to the Solid console, producing false warnings (`react(immutability)` on
  refs, `no-html-link-for-pages` on anchors); the console should get an override.

Validation (part 1):
- `apps/console` test: `Tests 9 passed (9)` on two consecutive runs (new `app-shell.test.tsx`:
  project links render in drawer + sidebar with `aria-current="page"` on the URL's project; email
  and top-bar title)
- typecheck clean; build `✓ built`; `bun run lint` exit 0; `architecture:check` OK;
  no `max-*:` variants
- Browser (API :4000, seeded demo account): 375px light — sign-in lands on `/board/grid`, no
  horizontal scroll, drawer opens/marks the current project/closes after navigating to
  `/board/platform`, New task opens the bottom sheet with a focused 16px input and created TASK-6;
  768px — top bar layout; 1280px dark — sidebar, header "6 tasks", New task; `/board/nope` →
  "Project not found".

### Part 2 — board lanes, stage tabs, states (done, 2026-09-23)

- `board-screen.tsx`: wrapped in `<Errored>` with retry button; 2px progress bar at top while
  `isPending(() => workspace.tasks())`; phone-only task-count row (`lg:hidden`); skeleton lanes
  (`SkeletonLanes` with 4 `bg-muted animate-pulse` blocks) under `<Loading>`.
- `stage-tabs.tsx`: horizontally scrollable row (`md:hidden`), 7 tabs with 8px status dots
  (`bg-status-<name>` via CSS var), label, count; `aria-controls` = `lane-<status>`,
  `aria-current="true"` on active; tap → `scrollIntoView({ inline: "start" })`; `IntersectionObserver`
  on lanes container (threshold 0.6) in `onSettled` syncs active tab on swipe and scrolls tab into
  view (`inline: "nearest"`).
- `board-lanes.tsx`: lanes container `flex snap-x snap-mandatory overflow-x-auto gap-3 md:snap-none`;
  each lane `<section id="lane-<status>">` with header (dot, label `text-ui-sm`, count
  `font-mono text-ui-xs`), body `flex flex-col gap-2 rounded-lg bg-muted p-2`, empty → "No tasks".
- `task-card.tsx`: `<article class="rounded-md border border-border bg-card p-3 space-y-1.5">`;
  key `font-mono text-ui-xs text-text-subtle`; title `text-ui break-words`; owner badge
  `text-ui-xs rounded border border-border px-1.5`; branch `font-mono text-ui-xs text-muted-foreground truncate`.
- `board-screen.test.tsx`: stubs `fetch` for auth/projects/tasks; renders `<WorkspaceProvider>` inside
  router at `/board/alpha`; asserts 7 lane headings, correct counts (1,1,0,0,0,0,0), 7 stage tabs
  with matching counts, "No tasks" in 5 empty lanes.

Validation (part 2):
```
$ bun --cwd=apps/console run test
Test Files  5 passed (5)
Tests  13 passed (13)

$ bun --cwd=apps/console run typecheck
(no output — clean)

$ bun --cwd=apps/console run build
✓ built in 411ms

$ bun run lint
exited with code 0 (warnings are pre-existing React-plugin false positives)

$ bun run format
finished in 45ms

$ bun run architecture:check
Architecture checks passed. [naming] OK (449 path(s) checked)

$ grep -rnE "max-(sm|md|lg|xl):" apps/console/src
(no output)
```

**Reviewer fixes to part 2 (claude, 2026-09-23):** the agent's board passed its tests but had
defects found in review and in the browser:
- the IntersectionObserver observed the *tab row* (which contains no lanes), so swiping never
  updated the active tab — the observer now lives in `BoardLanes` on the lane scroller;
- status dots used an inline `var(--color-status-*)` style; replaced with a literal class map
  (`lib/stage-style.ts`) so Tailwind generates them;
- ARIA `tablist`/`tab` roles on buttons whose lanes are not tab panels — now a `nav` of buttons with
  `aria-current` + `aria-controls`, as the card specifies;
- double horizontal padding, "1 tasks", a progress bar fixed under the phone top bar on every
  width, a non-existent `scrollbar-hide` class, and `groupByStatus` computed twice;
- Solid 2 treats an effect's (and ref callback's) return value as its cleanup: expression-bodied
  `ref={(el) => (x = el)}` / `tabs.set(...)` and `scrollIntoView(...)` (which returns a promise in
  current Chromium) made the board fail with "effect callback returned an invalid cleanup value" —
  caught by the new `<Errored>` boundary in the browser, invisible in happy-dom. All such callbacks
  now have block bodies.

Validation (final): console `Tests 13 passed (13)`; typecheck 0 errors; build `✓ built`;
`bun run lint` exit 0; `architecture:check` OK; no `max-*:` variants. Browser: 375px — "12 tasks",
seven stage tabs with coloured dots and counts, one full-width lane, no horizontal page scroll;
tapping "Done" scrolls its lane in and keeps the tab in view; scrolling the lanes to QA updates the
current tab (IntersectionObserver). 1280px dark — tabs hidden, 288px columns side by side, no page
overflow. Note: the in-app browser pane only renders frames around screenshots, so smooth scrolling
and observers there only advance when a frame is produced.
