# `@grid/ui`

Shared shadcn/ui primitives for the Grid monorepo.

This package follows the [shadcn monorepo](https://ui.shadcn.com/docs/monorepo) layout:

- UI primitives live in `src/components`
- Shared helpers in `src/lib`
- Shared hooks in `src/hooks`
- Design tokens + theme in `src/styles/globals.css`
- CLI config in `components.json`

## Add components

Run the CLI **from the app workspace** (not the package):

```bash
cd apps/web
bunx --bun shadcn@latest add button
```

The CLI installs primitives into `packages/ui` and app-only blocks into `apps/web`.

Keep `style`, `iconLibrary`, and `baseColor` identical in:

- `apps/web/components.json`
- `packages/ui/components.json`

## Importing

Preferred (deep imports — matches CLI aliases):

```tsx
import { Button } from "@grid/ui/components/button";
import { cn } from "@grid/ui/lib/utils";
import { useIsMobile } from "@grid/ui/hooks/use-mobile";
```

Barrel import (still supported):

```tsx
import { Button, Card, cn } from "@grid/ui";
```

## Styles

Apps import shared tokens from this package:

```css
@import "tailwindcss";
@import "@grid/ui/globals.css";
@source "../../../../packages/ui/src";
```

## Migration rule

Keep product-specific composed UI in `apps/web/src/components`. Move a component here only when it is a reusable primitive with no app routing/auth/data coupling.

## Linting the CLI-managed primitives

The flat files in `src/components` are shadcn CLI output and are kept as verbatim
copies, so `bunx --bun shadcn@latest add <component>` can overwrite them without
losing local work. Upstream's markup trips a handful of Biome rules — `role` on
plain elements, array indices as keys, the sidebar's cookie, the chart's injected
CSS variables — and hand-patching those would be undone by the next CLI update.

`biome.json` therefore turns those rules off for `packages/ui/src/components/*.tsx`
and excludes our own components from that override: `bottom-bar.tsx`,
`glass-card.tsx` and `typeset.tsx` are linted in full. Add any new component of
our own to that exclusion list — do not relax a rule repo-wide to make our code
pass.
