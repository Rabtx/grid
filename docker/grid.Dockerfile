# syntax=docker/dockerfile:1
# The whole of Grid in one image — `bun run grid` behind port 8080. See docker/compose/grid.yml.

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}
WORKDIR /grid

# git for project folders; agents' CLIs are installed by the operator (see /docs/portable).
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY . .
RUN bun install --frozen-lockfile --ignore-scripts \
	&& bun --cwd=apps/console run build

ENV GRID_DATA_DIR=/data \
	GRID_PROJECTS_DIR=/projects \
	GRID_PORT=8080
VOLUME ["/data", "/projects"]
EXPOSE 8080

CMD ["bun", "run", "grid"]
