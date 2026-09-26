# syntax=docker/dockerfile:1
# The whole of Grid in one image — `bun run grid` behind port 8080. See docker/compose/grid.yml.
# Only what the portable Grid runs is installed: the launcher, API, runner and console, not the
# marketing site or the docs.

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}
WORKDIR /grid

# git for project folders; agents' CLIs are installed by the operator (see /docs/portable).
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Every workspace manifest, so the frozen lockfile resolves; only Grid's own apps are installed.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/console/package.json apps/console/
COPY apps/docs/package.json apps/docs/
COPY apps/launcher/package.json apps/launcher/
COPY apps/nest-api/package.json apps/nest-api/
COPY apps/runner/package.json apps/runner/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/logger/package.json packages/logger/
COPY packages/tokens/package.json packages/tokens/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --ignore-scripts \
	--filter launcher --filter nest-api --filter runner --filter console

COPY packages packages
COPY apps/api apps/api
COPY apps/launcher apps/launcher
COPY apps/nest-api apps/nest-api
COPY apps/runner apps/runner
COPY apps/console apps/console
COPY docker docker
RUN bun --cwd=apps/console run build

ENV GRID_DATA_DIR=/data \
	GRID_PROJECTS_DIR=/projects \
	GRID_PORT=8080
VOLUME ["/data", "/projects"]
EXPOSE 8080

CMD ["bun", "run", "grid"]
