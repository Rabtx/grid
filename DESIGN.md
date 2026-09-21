# Design System Brief

This file is the source of truth for AI agents and humans when creating UI in Grid.
Keep it updated before generating new screens with Codex, Claude Code, Cursor, v0, Open Design,
Figma MCP, Onlook, Scamp, or similar tools.

## Product Intent

Grid should produce production-grade application interfaces, not generic demo pages.
Generated UI must feel domain-specific, accessible, responsive, and built from reusable components.

## Audience

- Developers starting new products from this monorepo.
- Designers or product builders using AI tools to explore screens.
- AI coding agents implementing UI from product briefs, Figma frames, or design-system prompts.

## Visual Principles

- Prefer clear hierarchy over decoration.
- Prefer operational density for dashboards, admin panels, and internal tools.
- Prefer calm, readable surfaces for documentation and product workflows.
- Avoid generic SaaS hero sections inside actual applications.
- Avoid decorative blobs, background glows, unnecessary nested cards, and one-note purple/blue gradients.
  Glass is an intentional component material described below, not a default page decoration.
- Use real state design: loading, empty, error, disabled, hover, focus-visible, selected, saving,
  success, and permission denied.

## Rabtx UI: shared design intent

This section records the owner's agreed direction. Use it when another agent or session takes
on a component. Existing code is an implementation to assess, not proof that the design is finished.

### Goal and scope

Build a polished, animated component layer on the existing shadcn-style foundation. Web components
must be responsive by default and work on desktop browsers. Mobile means real React Native/Expo
components, not just a narrow web layout. Share the design language and tokens; use platform-specific
rendering and interactions where needed. No separate desktop library is required now.

Work on one component at a time. Keep the implementation minimal (KISS, DRY, Ponytail): every
wrapper, style, dependency and abstraction must solve a current need. “Minimal” does not mean
omitting accessibility, useful feedback or the edge detailing that defines the material.

### Four materials

Material is the `kind` axis: `solid`, `detail`, `glass`, `terminal`. It is independent of color role
(`variant`: primary, secondary, destructive, ghost) and size. Do not confuse a material with a color.

| Kind | Intended appearance and behavior |
| --- | --- |
| `solid` | A clean opaque pill. Depth is three tones — a hairline edge, a light top edge and a dark bottom edge — and never a drop shadow. Polish comes from proportions, spacing, typography, color and complete interaction states. |
| `detail` | A surface with two touching rounded contours. The outer rim follows the inner curve with **zero gap or spacer** and subtly blends into the surrounding background. The inner contour carries the same depth as `solid` — hairline edge, light top, dark bottom — so the two materials differ in construction, not in tone. **No cast shadows, blurred shadows or background glow.** |
| `glass` | **Liquid glass**, in the sense Apple uses it across recent iOS and macOS: a translucent material that refracts and bends what sits behind it, picks up specular highlights along its edges, and reacts to motion rather than sitting flat. The background is part of the material, not a tint over it. Opacity plus a backdrop blur is a fallback, not the target — do not describe that fallback as finished. |
| `terminal` | Squarish corners, crisp edges and a coherent terminal aesthetic. Monospace and restrained color fit the direction. Current uppercase labels and hover inversion are implementation choices, not mandatory requirements for every future component. |

“Polished” is the quality bar for all four kinds; `detail` is one specific material construction.
Do not interpret polished as “add more shadows, glow or animation.”

### Detailed construction

- Start with the actual component surface and its rounded boundary.
- Put the outer contour directly against the inner contour; keep their curves concentric.
- Let the outer rim sit only subtly apart from the surrounding surface, including charcoal.
- Create depth through edge contrast, not a floating drop shadow. Detail and solid share one
  depth language: `--button-edge` for the hairline, `--button-sheen` and `--button-shade` for the
  light top and dark bottom. Solid draws those three tones as a border plus inset shadows; detail
  draws the same tones as its inner contour, which is what keeps its two contours touching, and
  inverts the bevel while pressed.
- Keep surface, rim and radius decisions in shared tokens. The Button consumes `--button-rim`
  for the outer detail contour and `--button-edge`, `--button-sheen`, `--button-shade` for the
  surface that sits inside it (the sheen and shade carry their own dark-theme values). Add more
  tokens only when an actual design decision needs them.
- Radius belongs to the material, not the size (`kindShape`): solid is a pill, and `size="icon"`
  is therefore a circle. Sizes change height, padding and text scale only.
- Check the result in light and dark themes on a plain background. A background effect must not
  conceal weak component styling. Where the host surface differs, adapt the rim token deliberately.

### Motion and interaction

Motion is on by default, purposeful and restrained. Press/release should feel responsive without
moving surrounding layout. Respect reduced motion and `animated={false}`. Disabled controls must
not activate or animate as enabled controls. Native caller callbacks must not suppress internal motion.

Current Button direction: solid uses a stiff press spring (0.93) with a 1.02 hover scale, detail a
restrained press (0.94) with a 1px hover lift, glass a softer spring, and terminal neither scales
nor lifts. Hover is gated behind a real-hover media query so touch devices do not keep a phantom
hover. These are a starting point to evaluate, not universal physics rules.

Review default, hover (web), keyboard focus, pressed, disabled, loading and success states where
applicable. Include leading/trailing icons and icon-only examples with accessible names. Keep labels
and dimensions stable during state changes. State-driven loading and result labels are built
(`state` with `loadingText` / `successText` / `errorText`) and morph the button's width between
labels; review them once on both platforms before calling them finished.

### Consistency and review

The same language should eventually apply to cards, inputs, sidebar items and the surrounding
application shell. Use semantic color and helpful SVGs where they clarify content, without decorative
color noise. Do not redesign every screen as part of a single component task.

The earlier design lab included controls for outer rim, inner edge, material, motion and a flat/polished
comparison. Those are useful review tools, not a requirement to add a large control API to components.
Before moving to the next component, review the current one across themes, sizes, interaction states
and supported platforms. Be explicit about untested native behavior and simplified material fallbacks.

### Current implementation and preview

- Foundation: `packages/ui` (`@grid/ui`). Its namespace remains unchanged intentionally.
- Polished layer: `packages/rabtx` (`@rabtx/ui`), starting with `@rabtx/ui/button`.
- Shared tokens: `packages/ui/src/styles/globals.css`.
- Shared Button choices: `packages/rabtx/src/button/button.shared.ts` — `kindShape`, `kindSurface`,
  `ghostSurface`, `sizeClass`, `kindMotion` — plus the transitions in `packages/rabtx/src/motion.ts`.
- Web/native implementations: `button.tsx` and `button.native.tsx` in that Button directory, with
  the ripple (`ripple.tsx`), the state label swap (`state-label.tsx`) and the hover-capability
  query (`../use-hover-capable.ts`) split out so a kind can be tuned without touching them.
- Preview source: `apps/docs/content/rabtx/button.mdx`; route: `/rabtx/button`. Previews are labelled
  rows, and `apps/docs/src/components/button-matrix.tsx` renders a material across all colour roles
  and sizes so a kind is reviewed at every box size at once.
- Current glass fallback: web translucency plus backdrop blur; native flat translucency. Neither is
  liquid glass yet. On native the intended path is `expo-glass-effect`, already a mobile dependency,
  which hands the real system material to iOS instead of imitating it. The web has no equivalent
  system material, so it has to be approximated — layered translucency, an edge highlight that
  responds to the surface behind it, and refraction where it is affordable. Treat the web and native
  results as the same material with different fidelity, and say which one you tested.
  Shadows still present in other kinds do not redefine the detail contract.

## Layout Rules

- Use stable dimensions for toolbars, sidebars, tables, cards, and repeated controls.
- Do not let text overflow buttons, tabs, cards, table cells, or mobile headers.
- Do not place cards inside cards unless it is a true repeated item or modal body.
- Keep desktop workflows scannable and mobile workflows thumb-friendly.
- Use responsive constraints instead of viewport-scaled font sizes.

## Tokens

The shared Tailwind 4 design tokens live at `packages/ui/src/styles/globals.css` (shadcn monorepo style).

Current baseline:

- Background: `--background`
- Foreground: `--foreground`
- Primary: `--primary`
- Secondary: `--secondary`
- Muted: `--muted`
- Border: `--border`
- Ring: `--ring`
- Radius: `--radius`
- Charts: `--chart-1` through `--chart-5`
- Sidebar tokens: `--sidebar-*`

When adding a new app, do not invent one-off color systems. Extend the shared token package or
create an app-specific override with a short rationale.

## Typography

- Use the app's configured sans font for product UI.
- Reserve large display text for true first-viewport marketing or documentation hero sections.
- Use smaller, tighter headings inside dashboards, cards, sidebars, tables, and forms.
- Keep letter spacing at `0` unless a specific brand treatment requires otherwise.

## Components

The repo has a shared web primitive package at `packages/ui` and app-local primitives in
`apps/web/src/components/ui`.

Current rule:

- Use `@grid/ui` for stable shared primitives such as `Button`, `Card`, `Badge`, form fields,
  `Separator`, `Skeleton`, and `Textarea`.
- Use `@rabtx/ui` for the polished material variants described above; extend that layer one
  component at a time rather than creating another parallel library.
- Keep complex or app-specific composed components inside each app or feature module.
- Promote a component to `packages/ui` only after it is reusable and free of route/auth/data
  coupling.
- Extend the existing `/rabtx` docs routes for visual review of the polished components.
- Add examples for loading, empty, error, disabled, hover, focus-visible, and selected states.

## AI UI Generation Rules

Before implementing UI, an agent should:

1. Read this `DESIGN.md`.
2. Read the target app's README and existing components.
3. Identify reusable components and tokens.
4. Ask for missing product context if the screen purpose is unclear.
5. Propose an implementation plan before editing.

After implementing UI, an agent should:

1. Run lint/typecheck/tests for the touched app.
2. Capture or inspect desktop and mobile rendering where possible.
3. Check long text, empty data, error states, and keyboard focus.
4. List any intentional differences from the design reference.

## Prompt Template

```txt
Use DESIGN.md and the existing app components as the source of truth.

Design/implement [screen/component].

Audience:
[who uses it]

Primary task:
[what the user must complete]

Domain constraints:
[data density, privacy, accessibility, workflow, device context]

Required states:
loading, empty, error, validation, hover, focus-visible, selected, disabled, saving, success

Quality bar:
No generic SaaS layout. No decorative blobs. No nested cards. Use shared tokens, stable spacing,
accessible contrast, responsive behavior, and existing component conventions.

Before coding, return:
1. Components to reuse.
2. New components needed.
3. Token changes if any.
4. Tests or visual checks to run.
```
