---
name: solid-2
description: >-
  Use for any code in apps/console or any other Solid code in Grid. Grid runs Solid 2
  (solid-js / @solidjs/web 2.0 RC, @solidjs/router 2.0.0-next, @solidjs/vite-plugin 3). Lists the
  Solid 1.x APIs that are removed or deprecated and their 2.0 replacements, plus the idioms to
  follow. Keywords: solid, solidjs, createEffect, createResource, Suspense, Loading, Errored,
  onMount, onSettled, createStore, router, createRouter, query, action, vite-plugin-solid.
---

# Solid 2 in Grid

`apps/console` is the product UI and is written for **Solid 2 only**. Training data and
docs.solidjs.com still describe Solid 1.x, so do not write Solid from memory. The sources of
truth, in order:

1. The installed typings: `apps/console/node_modules/solid-js/types/**`,
   `@solidjs/web/types/**`, and `@solidjs/signals` (the reactive core, re-exported by `solid-js`).
   Anything marked `@deprecated` there is off limits.
2. `node_modules/solid-js/CHEATSHEET.md` (ends with a 1.x → 2.0 section) and
   `node_modules/@solidjs/router/README.md` ("Migration from 0.x").
3. Upstream: [MIGRATION.md](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/MIGRATION.md),
   the [router changelog](https://github.com/solidjs/solid-router/blob/next/CHANGELOG.md) and the
   [vite plugin changelog](https://github.com/solidjs/solid-vite-plugin/blob/next/CHANGELOG.md).

## Packages

| Package | Notes |
|---|---|
| `solid-js`, `@solidjs/web` | Keep on the same exact RC; the compiler output only works with the matching runtime. |
| `@solidjs/router` | Use the `2.0.0-next.*` line. The npm `latest` tag (1.x) targets Solid 1 — never install it. |
| `@solidjs/vite-plugin` | Replaces `vite-plugin-solid`, which is now only a re-export stub. |

Pin exact versions (no `^`) while these are prerelease, and bump them together.

## Removed or renamed in 2.0 — never use the left column

**Imports and JSX**

| Solid 1.x | Solid 2 |
|---|---|
| `solid-js/web` | `@solidjs/web` |
| `solid-js/store` | `solid-js` (stores are in core) |
| `import type { JSX } from "solid-js"` | `from "@solidjs/web"` |
| `jsxImportSource: "solid-js"` | `"@solidjs/web"` |

**Reactivity and lifecycle**

| Solid 1.x | Solid 2 |
|---|---|
| `createEffect(fn)` | `createEffect(compute, apply)` — track in `compute`, side effects in `apply` (may write signals) |
| `initialValue` on effects/memos | removed; the memo's second argument is options |
| `onMount` | `onSettled` (may return a cleanup) |
| `onCleanup` for component setup/teardown | return the cleanup from `onSettled`; `onCleanup` is for primitives |
| `createComputed`, `on(...)` | removed; use `createMemo` or the split effect |
| `batch` | removed; updates batch per microtask, `flush()` forces them |
| `startTransition`, `useTransition` | removed; transitions are built in |

**Async data**

| Solid 1.x | Solid 2 |
|---|---|
| `createResource` | async `createMemo(async () => …)` (or `createStore(fn)` / `createProjection`) under `<Loading>` |
| `resource.loading` | `<Loading>` for first load; `isPending(() => x())` for later refreshes |
| `refetch()` | `refresh(x)` (silent) — `affects(x)` first if it should show as pending |
| `mutate()` | `action(function* …)` with `createOptimistic` / `createOptimisticStore` |

**Boundaries**

| Solid 1.x | Solid 2 |
|---|---|
| `<Suspense>` | `<Loading>` (optional `on` prop) |
| `<SuspenseList>` | `<Reveal order="sequential" \| "together" \| "natural">` |
| `<ErrorBoundary>` | `<Errored fallback={(err, reset) => …}>` |
| `onError`, `catchError`, `resetErrorBoundaries` | `<Errored>` or the effect's `error` handler |

**Stores**

| Solid 1.x | Solid 2 |
|---|---|
| `produce` | removed; store setters receive a draft by default |
| path setters `setStore("a", "b", v)` | `storePath(...)` helper, opt-in |
| `unwrap` | `snapshot` |
| `reconcile(data)` | `reconcile(data, "id")(draft.sub)` inside a draft setter |
| `createMutable`, `modifyMutable` | `createStore` with draft setters |
| `createSelector` | `createProjection` or `createStore(fn)` |

**Props and control flow**

| Solid 1.x | Solid 2 |
|---|---|
| `mergeProps` | `merge` (note: `undefined` now overrides) |
| `splitProps` | `omit(props, ...keys)` |
| `<Index>` | `<For keyed={false}>` (item is an accessor, index a number) |
| `indexArray` | `mapArray` |
| `<Dynamic>`, `createDynamic` | `dynamic(source)` (`<Dynamic>` is deprecated) |
| `Context.Provider` | `<Context value={…}>` |

**DOM**

| Solid 1.x | Solid 2 |
|---|---|
| `classList={{ … }}` | `class={{ … }}` or `class={["base", { active: on() }]}` |
| `class:`, `style:`, `attr:`, `bool:`, `on:`, `oncapture:` namespaces | removed; lowercase attributes, boolean = present/absent, listener options in a ref callback |
| `prop:defaultValue`, `prop:selected` | `defaultValue`, `selected` |
| `use:directive={x}` | `ref={directive(x)}`, or an array `ref={[a, b]}` |
| `/*@once*/` | `untrack` or `defaultValue` |

**Router (`@solidjs/router` 2.0.0-next)**

| 0.x (Solid 1 era) | 2.0.0-next |
|---|---|
| `<Router root>` + `<Route>` | `createRouter({ routes })`; the returned component is the provider, its render-prop child the root layout |
| `HashRouter`, `MemoryRouter` | `history: hashHistory()` / `memoryHistory()` |
| `<A>` | plain `<a>`; style `[data-active]` / `[aria-current]`, `useLinkState` for custom links |
| `<Navigate>` | `useNavigate()` during setup, or redirect from `preload` |
| `cache` | `query` |
| `createAsync`, `createAsyncStore` | `createMemo(() => query(...))` / `createProjection` |
| `useSubmission` | `useSubmissions().at(-1)`, `.onSubmit` + optimistic primitives |
| `redirect`, `reload`, `json` | `redirect`, `reload`, `respond` from `@solidjs/web` |
| `useCurrentMatches` | `useRouteMatches` |

## Idioms to follow

- **Pass values, not getters, as props.** `<Form slug={activeSlug()} />` and read `props.slug`;
  never `slug={() => activeSlug()}`. Props are already reactive getters.
- **Don't destructure props** — it reads them once and loses reactivity. Use `props.x`, `omit`,
  `merge`.
- **Async memos only where something is fetched.** A memo deriving from an async memo can be a
  plain `createMemo(() => groupByStatus(tasks()))`; pending state propagates on its own.
- **Contexts without a default already throw** `ContextNotFoundError` from `useContext`; a
  `useX()` wrapper should just `return useContext(XContext)`, not re-check for `undefined`.
- **Component-level side effects go in `onSettled`**, not bare in the component body.
- **Event handlers bind once** and are not reactive; read signals inside the handler.
- `<Show>` / `<Match>` function children receive an accessor: `{(user) => user().name}`.
- `<For>` is keyed by default: the item is the raw value, the index an accessor.
- The console never imports React components from `@grid/ui`; only its CSS tokens
  (`@grid/ui/globals.css`).

## Before finishing Solid work

1. Grep your change for every left-column API above; none may appear.
2. `bun --cwd=apps/console run typecheck`, `lint`, `test`, `build`.
3. Run the console and exercise the change in a browser (sign in with the seeded demo account,
   see `apps/nest-api/src/database/seed.ts`); check the console for errors. UI changes also follow
   the [mobile-first](../mobile-first/SKILL.md) skill.
