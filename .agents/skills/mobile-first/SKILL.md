---
name: mobile-first
description: >-
  Use whenever building or changing UI in Grid, especially the Solid console (apps/console):
  layouts, screens, components, Tailwind classes, responsive behaviour, breakpoints, touch
  targets, dialogs, navigation, boards and tables. Grid is designed mobile first — unprefixed
  Tailwind classes are the phone layout and breakpoint prefixes add the desktop layout on top, in
  one component. Keywords: mobile first, responsive, breakpoint, sm: md: lg:, phone, tablet,
  touch, safe area, dvh, container query.
---

# Mobile-first UI (Grid)

Grid is a browser-first control plane and a phone is a real control surface for it, not an
afterthought (see `DESIGN.md` → Layout Rules). Every screen is designed for the smallest viewport
first and then enhanced for wider ones.

Mobile first does **not** mean a separate mobile app or a second set of components. It means one
component, one markup tree, whose default styles are the phone layout and whose breakpoint
prefixes layer the tablet and desktop layout on top.

Read `DESIGN.md` first; this skill only covers the responsive side of it.

## How it works in Tailwind 4

Tailwind breakpoints are `min-width` media queries. An unprefixed class applies everywhere; a
prefixed class applies **from that width up**:

| Prefix | Applies from | Typical device |
|---|---|---|
| _(none)_ | 0 | phone — the base design |
| `sm:` | 40rem (640px) | large phone, landscape |
| `md:` | 48rem (768px) | tablet |
| `lg:` | 64rem (1024px) | laptop — sidebars appear |
| `xl:` | 80rem (1280px) | desktop |
| `2xl:` | 96rem (1536px) | wide desktop |

So write the phone styles first, then add only what changes:

```tsx
// Right: phone is the default, wider screens add to it
<div class="flex flex-col gap-3 px-4 md:flex-row md:gap-6 lg:px-8">

// Wrong: desktop-first, then patched back down for phones
<div class="flex flex-row gap-6 px-8 max-md:flex-col max-md:gap-3 max-md:px-4">
```

`max-*:` variants are a smell. Use them only for a genuinely phone-only detail that has no
desktop counterpart, never to undo a desktop layout.

## Rules

### Layout

- **Single column by default.** Stack content vertically; introduce side-by-side columns at `md:`
  or `lg:` only when there is room for each column to be readable.
- **Fluid, not fixed.** Use `w-full`, `min-w-0`, `max-w-*`, `flex-1` and `grid` fractions. Fixed
  widths (`w-72`, `w-[480px]`) are for `md:` and up, e.g. `w-full md:w-72`.
- **No horizontal page scroll at 320px.** Long ids, URLs, branch names and code get `min-w-0` on
  their flex parent plus `truncate` or `break-words`. The only allowed horizontal scroll is a
  deliberate scroller (board columns, tabs) with `overflow-x-auto` and snap points.
- **Spacing grows with the viewport:** `px-4 md:px-6 lg:px-8`, `gap-3 md:gap-4`.
- **Components that live in resizable panels use container queries** (`@container` on the parent,
  `@sm:` / `@md:` on children) instead of viewport breakpoints, so a card behaves the same in a
  narrow sidebar on desktop as on a phone.

### Navigation and chrome

- **App shell:** on phones, a compact top bar (title + primary action) and navigation in a sheet
  or bottom bar; the persistent sidebar appears at `lg:` (`hidden lg:flex`).
- **Primary action within thumb reach** on phones (bottom of the screen or the top bar), not buried
  in an overflow menu.
- **Dialogs become sheets on phones:** full-width, anchored to the bottom or full-screen, with the
  centred modal starting at `md:`.
- **Tables become lists on phones:** show a stacked row with the two or three fields that matter;
  reveal the full table layout at `md:` or `lg:`. Do not ship a squashed desktop table.

### Touch and input

- **Touch targets at least 44×44px** (`min-h-11 min-w-11`, or padding that reaches it). Visually
  small icons can keep a small glyph inside a larger hit area.
- **Never hide actions behind hover alone.** Tailwind 4 already scopes `hover:` to devices that can
  hover, so a hover-revealed action is invisible on touch; keep it visible on phones
  (`opacity-100 lg:opacity-0 lg:group-hover:opacity-100`) or move it into a menu.
- **Form inputs are at least 16px on phones** (`text-base md:text-sm`) — iOS zooms the page when a
  smaller input is focused.
- Use the right keyboard: `type="email"`, `inputmode="numeric"`, `enterkeyhint`, `autocomplete`.

### Viewport

- The console's `index.html` viewport should be
  `width=device-width, initial-scale=1, viewport-fit=cover`; never disable zoom.
- Full-height screens use `min-h-dvh` / `h-dvh`, not `h-screen` (`100vh` ignores the mobile browser
  toolbars).
- Fixed bars pad for the notch and home indicator with
  `pb-[env(safe-area-inset-bottom)]` / `pt-[env(safe-area-inset-top)]`.

### Typography

- Body text stays readable at `text-sm`/`text-base` on phones; headings step up with breakpoints
  (`text-lg md:text-xl`). Never scale fonts with viewport units (`DESIGN.md`).

### Behaviour belongs in CSS

- Switch layouts with classes, not JavaScript. Do not read `window.innerWidth` or render
  different component trees per device; that breaks on resize, rotation and split-screen.
- If behaviour (not appearance) genuinely differs — e.g. a drag-and-drop board on desktop versus
  tap-to-move on touch — branch on capability (`(pointer: coarse)`, `(hover: hover)`) in one place,
  not on screen width scattered through components.

## Checklist before calling UI done

1. Designed at **375px** first; checked at **320px** (no overflow), **768px** and **1280px**.
2. No fixed width without a breakpoint prefix; no `max-*:` used to undo a desktop layout.
3. Every action reachable by touch; targets ≥ 44px; nothing hover-only.
4. Inputs ≥ 16px on phones; correct `type` / `inputmode`.
5. Long text truncates or wraps; empty, loading and error states also fit a phone.
6. Keyboard focus order still makes sense at every breakpoint.

## Verifying

Run the console (`bun --cwd=apps/console run dev`) and check it in a browser at phone, tablet and
desktop widths — e.g. the built-in browser's `resize_window` with the `mobile` and `tablet`
presets, or Playwright with `page.setViewportSize`. Screenshot the phone width in the card's
validation notes. For a real device on the same network, open the console by this machine's LAN
IP on port 3001; the API and dev servers already accept it.
