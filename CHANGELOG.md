# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Runner threads sync to Grid's database (with their attachments) and can be restored on a new
  machine from Settings → Machines or `grid restore`; threads on paired environments sync through
  the home runner, and a fresh agent on a restored thread is told the earlier turns.
- The installer asks for an optional hosted database (`GRID_DATABASE_URL`), and a checkout's API
  and runner share a runner key so threads sync without settings.

### Fixed

- Approvals stay in the inbox while their thread is open, and are settled once answered.
- The landing page shows the real install URL instead of localhost.

### Changed

- The repository moved to [Rabtx/grid](https://github.com/Rabtx/grid); links, the installer
  default and the site point there.

## [0.2.0-beta] - 2026-10-09

First public beta: Grid as a browser-first control plane where agents do the work on any machine.

### Added

- One-line install for Grid or a runner only (`curl … | bash`), the `grid` command, systemd user
  services, and a new landing page at grid.rabtx.dev.
- One command (`apps/launcher`) runs the whole of Grid on a laptop, VPS or codespace, built for
  always-on use without dev servers; Grid can update and restart itself from Settings.
- Workspaces that own projects and billing, with members, invites, roles and custom roles enforced
  for agents, approvals, merges and machines.
- Threads with coding agents (ACP agents, Codex, Claude Code, Freebuff and more): a composer with
  models, effort, modes, slash commands, @ file mentions and attachments; edits as diffs; a git
  worktree per thread when chosen; push notifications when an agent finishes or needs approval.
- An inbox for everything waiting on you, a Home with what needs you and what runs next, a board
  whose tasks an agent can run, notes, a file editor with blame and agent changes, terminals,
  pull requests with reviews, automations on a schedule or GitHub trigger, search and Ask Grid.
- Environments: run a project on the machine its folder is on, pair a codespace or another Grid
  over the tailnet, and install and sign in agents on any machine from Grid.
- Connectors to official MCP servers with OAuth, a vault and a rule-keeping proxy for agents;
  Pulse for shipping, metrics and runway; Ship with environments, promote, roll back and previews;
  Operate with logs, costs, health incidents and alerts.
- Sign-in with passkeys, a second factor, Google or an emailed link; a console PWA that opens
  offline and keeps chats and lists on the device.

### Changed

- The API moved from NestJS to Hono on Bun (`apps/api`), with the schema and migrations in
  `packages/db` (Drizzle). Swagger at `/api/docs` is no longer served.
- The console was rebuilt on Solid 2 with its own design-system kit, following the Figma design.
- Documentation lives only in `apps/docs` (Fumadocs).

### Removed

- The NestJS API, the root `docs/` folder and the web API backend switcher.

## [0.1.0] - 2026-02-10

### Added

- Initial monorepo layout (Turborepo + Bun), before the rename to Grid.
- Dual license: MIT and Apache-2.0.

[Unreleased]: https://github.com/Rabtx/grid/compare/v0.2.0-beta...HEAD
[0.2.0-beta]: https://github.com/Rabtx/grid/releases/tag/v0.2.0-beta
[0.1.0]: https://github.com/Rabtx/grid/releases/tag/v0.1.0
