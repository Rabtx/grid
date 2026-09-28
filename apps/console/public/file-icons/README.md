# File icons (temporary, development only)

These are the **Flow Deep** theme of [Flow Icons](https://flow-icons.pages.dev) by thang-nm
(Flow Icons 2.0.9), copied unchanged: `deep/` and `deep-light/` hold the icons for dark and light,
`theme.json` is the theme's own `deep.json` (which name, folder or extension gets which icon).

Flow Icons is a paid, copyrighted pack. Its author, a friend of the project, allowed its use while
Grid is in development and will draw Grid its own icons. Until then:

- keep this repository **private** — these files must not be published or redistributed;
- replace this folder when the new icons arrive (same layout: icons plus a VS Code icon-theme JSON
  named `theme.json`), and nothing else needs to change.

The console reads `theme.json` at start and matches file and folder names the way the editor does
(`apps/console/src/lib/file-icons.ts`); the service worker does not precache these files.
