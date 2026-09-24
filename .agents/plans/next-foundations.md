# Next foundations: every agent, in the right folder, and a board worth using

Grid now has projects as folders with threads, agent settings, and a shell that matches the
design reference. Before `@` mentions and bots, the everyday loop has to be solid: every
installed agent works, always in the project's folder; the board is part of each project; filing
an issue is quick; and what agents write reads well.

## Order

| # | Card | Owner | Why now |
|---|------|-------|---------|
| 1 | `2026-09-25-codex-adapter` | claude | Codex is installed but Grid cannot drive it. |
| 2 | `2026-09-25-agent-folder-smoke` | claude | Prove, with real runs, that every agent edits files in the project folder. |
| 3 | `2026-09-25-project-board` | claude | The board is a separate screen today; it belongs to the project, and creating issues is clumsy. |
| 4 | `2026-09-25-markdown-quality` | claude | Agent replies and task descriptions deserve better typography and code. |
| 5 | `2026-09-25-runner-restart-recovery` | another agent | Chat and terminals should recover by themselves when the runner restarts. |
| — | `2026-09-24-terminal-native-touch` | another agent | Already open. |
| later | `@` mentions, bots, slash commands | — | Built on the above. |

Cards 1–4 run in that order on their own branches; 5 is independent and can run in parallel.

## Principles carried through

- A project is a folder; a thread works in its project's folder when it starts and when it
  resumes. Anything else is a bug.
- One adapter per agent, all speaking the runner's `ChatEvent` model; the console never learns
  an agent's own protocol.
- Model lists are kept by the runner and refreshed from Settings → Agents, never per thread.
- Phone first: every change is checked at 390×844 as well as 1440×900.
