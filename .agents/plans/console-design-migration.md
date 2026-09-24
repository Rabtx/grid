# Plan: bring the console onto the prototype's design, step by step

Status: **in progress** — Phases 0–1 merged (#22); Phase 2 cards open on the board; decisions below taken with the recommended defaults (2026-09-24)
Owner: human · Coordinator: pm · Implementers: ui-ux (tokens, primitives), web (screens), backend (API)
Created: 2026-09-24

## Goal

The human has designed Grid's product UI as a clickable prototype. This plan rebuilds that design in
the Solid console (`apps/console`) **gradually** — tokens first, then the screens that already
exist, then new product surfaces — so every step ships something real, reviewable and working.

## Ground rules

1. **Rebuild, never port.** The prototype is a React app. We read it for layout, behaviour and
   values, and write Solid 2 code from scratch. No prototype source files, components or CSS are
   copied into the repo.
2. **The prototype stays outside the repo.** It lives on the human's machine; ask the human for its
   location. Reference screenshots and notes are kept out of git. Never name the prototype's
   upstream projects in code, comments, docs, commits or cards — describe patterns in Grid's terms.
3. **Mobile first, always.** The prototype is desktop-first with a phone layer bolted on. Here the
   phone layout is designed first and the desktop layout is added with breakpoint prefixes, in one
   component (`.agents/skills/mobile-first`).
4. **Solid 2 only** (`.agents/skills/solid-2`), tokens only (`tokens.test.ts` enforces it), no new
   dependency without a reason recorded on the card.
5. **Only real data on screen.** A screen shows what the API actually provides. Fields the prototype
   has but the API does not (priority, agents, runs…) arrive with their backend phase, not as
   placeholders.
6. **One card, one PR, one reviewable step.** Each step below is sized to be one card. A step is
   done only when its Definition of done is met and it is merged.

## How every step is verified

- Screenshot the prototype and the console side by side at **375, 768 and 1280 px**, light and dark.
  Differences are either fixed or listed on the card as intentional.
- `bun --cwd=apps/console run test`, `typecheck`, `build`; `bun run lint`; `architecture:check`.
- Exercise the flow in a real browser against the API with the seeded demo account; check the
  console for errors.
- Loading, empty, error, disabled, focus-visible and long-text states checked at 320 px.

---

## Phase 0 — Design foundation (frontend only)

The goal of this phase: after it, anything built looks like the prototype automatically.

**0.1 Token migration.** Move `packages/tokens/src/product.css` onto the prototype's colour model:
one background and one "ink" colour per theme, with every border, fill, hover, selection and
secondary text expressed as ink mixed at a fixed percentage (the measured ladder from the design
doc), plus the signal colours (accent, success, danger, warning) and the board's status colours.
Keep the existing token names working (`bg-card`, `text-muted-foreground`…) so current screens do
not break; add the new ink utilities alongside.
*Done when:* both themes match the prototype's colours on a side-by-side swatch page, the console
looks unchanged apart from colour, and DESIGN.md documents the ink ladder.

**0.2 Type, density and radius.** Adopt the prototype's desktop values from `md:` up (12–13 px UI
text, 28 px default row, its radius and spacing scale), keep the larger phone sizes below `md:`
and the 44 px touch floor on coarse pointers. Update `tokens.test.ts` if the scale names change.
*Done when:* rows, inputs and text match the prototype at 1280 px and stay thumb-friendly at 375 px.

**0.3 Motion.** Align `duration-*` / easing tokens with the prototype's timings (fast feedback,
disclosure, sheet arrival, faster exits) and reduced-motion behaviour.

**0.4 Primitives.** A small component set in `apps/console/src/ui/`, each with every state:
Button (primary, secondary, ghost, danger; sizes), IconButton, Input, Textarea, Select,
SegmentedControl, Checkbox/Switch, Chip/Badge/StatusDot, ListRow, Dialog + Sheet (phone bottom
sheet / desktop centred), Menu/Popover, Tooltip, Kbd, Skeleton, EmptyState, Toast. One icon set
(inline SVG, one stroke weight) replaces the ad-hoc icons.
*Done when:* each primitive has a component test for its states, and a dev-only `/dev/ui` route
shows every primitive in every state for visual review (excluded from production builds).

## Phase 1 — Re-skin what exists

Same behaviour, new design. No API changes.

**1.1 Sign-in.** The login screen in the new design: brand, form, pending and error states, the
"second factor not supported yet" case, keyboard submit.
**1.2 App shell.** Sidebar (desktop) and drawer + top bar (phone) rebuilt on the primitives and
matched to the prototype's shell anatomy: brand/workspace switcher, primary navigation, project
list, account menu at the bottom. Only destinations that exist are shown.
**1.3 Board, current data.** Lanes, stage tabs and task cards restyled to the prototype's card
anatomy using only today's fields (key, title, owner, branch, status).
**1.4 System screens.** Not found, project not found, no projects, loading and error boundaries in
the new EmptyState/Skeleton primitives.

*Phase done when:* every current console screen matches the prototype's look at all three widths.

## Phase 2 — Board interaction, current data

**2.1 Task panel.** Opening a card shows the task: a side panel on desktop, a full-screen sheet on
phones. Title, description (Markdown write/preview), status, owner and branch are editable — the
API already has `PATCH`/`DELETE` for tasks. Delete with confirm.
**2.2 Views and filtering.** "By status" / "By owner" segmented views, text filter, owner filter.
**2.3 Moving tasks.** Change status from the panel and from the card; drag between lanes on
pointer devices, a "Move to…" menu on touch (branch on capability, not width).

## Phase 3 — Richer tasks (backend + UI)

One card per field group, each a migration + endpoints + UI:
**3.1** priority · **3.2** labels (project-scoped) · **3.3** due date and estimate ·
**3.4** acceptance checklist · **3.5** activity history (created, moved, assigned, edited).
Contracts go in `apps/docs/content/docs/backend-api.mdx` first.

## Phase 4 — Agents on the board (backend + UI)

**4.1** An agent/provider registry served by the API — provider-agnostic, nothing hard-coded to
one vendor. **4.2** Assign an agent and model to a task; mode (supervised / auto edits / full
access) and workspace (current checkout / worktree). **4.3** The agent summary strip (running,
queued, shipped, pause) and the "By agent" view.

## Phase 5 — Runs and sessions

**5.1** "Run with agent" dispatch, queueing and run states on the card. **5.2** Approvals.
**5.3** Session view and the new-session composer. **5.4** "Auto-assign" and "Run ready".
This phase depends on Grid's agent runtime and gets its own plan before it starts.

## Phase 6 — Remaining surfaces, as the product needs them

Command palette and search · settings (appearance: theme and density — `lib/preferences.ts`
already stores them) · inbox and notifications · automations · source control · files ·
terminal. Each gets a card when it is scheduled; none is started speculatively.

---

## Decisions (recommended defaults accepted 2026-09-24; revisit any time)

| # | Question | Recommended default |
|---|---|---|
| 1 | Board stages: keep Grid's 7 (backlog, ready, in progress, review, QA, blocked, done) or adopt the prototype's 5 (backlog, todo, in progress, review, done)? | Keep 7 — the API and data already use them; restyle only |
| 2 | Theme: follow the OS (current) or default to dark like the prototype? | Follow the OS, dark tuned first |
| 3 | Desktop density: match the prototype exactly (≈13 px text, 28 px rows)? | Yes from `md:` up; phones keep larger sizes |
| 4 | Where the two design references disagree, which wins? | The human's prototype and its design doc; the second reference only for the kanban |

## Delegation notes

Self-contained, well-specified steps (0.3, 0.4 per primitive, 1.4, 2.2, each Phase 3 field) suit
delegated agents with a detailed brief; the reviewer still checks the diff and the browser.
Cross-cutting steps (0.1, 0.2, 1.2, 2.1, Phase 4–5) are done or closely paired by the reviewer.

## Progress

| Step | Card | PR | Status |
|---|---|---|---|
| 0.1–0.4, 1.1–1.4 foundation and re-skin | `2026-09-24-console-design-foundation-v2.md` | #22 | done |
| 2 prerequisite: primitives | `2026-09-24-console-primitives-phase-two.md` | #27 | done |
| 2.2 views and filters | `2026-09-24-console-board-views-filters.md` | #25 | done |
| tooling: console lint override | `2026-09-24-console-lint-override.md` | #26 | done |
| brand logo and app icons | — | #28 | done |
| 2.1 task panel | `2026-09-24-console-task-panel.md` | #29 | done |
| icons: Hugeicons | — | #30 | done |
| appearance model | — | #31 | done |
| installable PWA | `2026-09-24-console-pwa.md` | #32, #33 | done |
| 2.3 moving tasks | `2026-09-24-console-move-tasks.md` | #34 | done |
| 6: settings → appearance | `2026-09-24-console-appearance-settings.md` | #35 | done |
| 6: terminal (apps/runner) | `2026-09-24-console-terminal.md` | #36 | done |
| UX polish: native feel | `2026-09-24-console-native-feel.md` | — | doing (claude) |
| UX polish: session keep-alive | `2026-09-24-console-session-keepalive.md` | — | open |
| UX polish: touch targets | `2026-09-24-console-touch-targets.md` | — | open |
| UX polish: toasts and new-task flow | `2026-09-24-console-toasts.md` | — | open |
| UX polish: keyboard shortcuts | `2026-09-24-console-keyboard-shortcuts.md` | — | open |
| UX polish: sign-in polish | `2026-09-24-console-login-polish.md` | — | open |
