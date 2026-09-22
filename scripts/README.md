# Grid scripts

Shell utilities that support the repository. There is no example code here — every script
has a job.

## Layout

```
scripts/
├── architecture/   # boundary and kebab-case naming checks, run by CI and the pre-commit hook
│   ├── check-boundaries.sh
│   └── check-naming.sh
├── bash/           # developer utilities
│   ├── docker-group.sh
│   └── .shellcheckrc
├── git-hooks/      # the scripts lefthook runs
└── README.md
```

## Commands (from root)

| Command | Purpose |
| --- | --- |
| `bun run architecture:check` | Import-boundary rules, then the naming check |
| `bun run naming:check` | kebab-case file and folder names |
| `bun run scripts:lint` | ShellCheck over every script in this tree |
| `bun run scripts:format` | shfmt, four-space indent |

`shellcheck` and `shfmt` come from `mise install` — see `.mise.toml`.

## docker-group.sh

Adds the current user to the `docker` group so `docker compose` runs without sudo, which is
how the local Postgres comes up. Run it once, then log out and back in, or `newgrp docker`.

```bash
bash scripts/bash/docker-group.sh
```
