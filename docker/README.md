# Docker layout

Compose is split into **fragments** under `compose/` and merged by the root
`docker-compose.yml` via [`include`](https://docs.docker.com/compose/how-tos/multiple-compose-files/include/)
(Compose **v2.20+**). Files use the Compose Specification — **no** obsolete top-level `version:` key.

| File | Role |
|------|------|
| `compose/postgres.yml` | Postgres 16, volume, healthcheck |
| `compose/api.yml` | The Grid API image (`apps/api/Dockerfile`, Bun) |
| `compose/grid.yml` | Portable Grid — the whole product in one image (`docker/grid.Dockerfile`); run with `postgres.yml`, see `/docs/portable` |
| `compose/web.yml` | Next.js web image (standalone output) |

**Env:** copy `env.docker.example` from the repo root to `.env`.

```bash
cp env.docker.example .env
docker compose up -d --build
```

| Service | Host port (default) |
|---------|---------------------|
| Postgres | 5433 → 5432 |
| API | 4000 |
| Web | 3000 |

`NEXT_PUBLIC_API_URL` (formerly `NEXT_PUBLIC_NEST_API_URL`, still read) must be a URL the **browser** can reach (usually `http://localhost:4000`), not the Docker service hostname.

**Postgres only** (API/web on the host):

```bash
docker compose up -d postgres
```

**Manual fragment (no `include`):**

```bash
docker compose -f docker/compose/postgres.yml --project-name grid up -d
```
