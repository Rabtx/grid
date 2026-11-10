# syntax=docker/dockerfile:1
# One teammate's runner. The API starts a container from this image for each team-managed
# machine: rootless, read-only, with a named volume at /home/grid and the runner published
# only on the host's loopback. See apps/api/src/modules/machines/provision.ts.
# Not started by the root compose file.

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}
WORKDIR /grid

# git for project folders; agent CLIs install into the home volume, not this image.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Every workspace manifest, so the frozen lockfile resolves; only the runner is installed.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/console/package.json apps/console/
COPY apps/docs/package.json apps/docs/
COPY apps/launcher/package.json apps/launcher/
COPY apps/runner/package.json apps/runner/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/logger/package.json packages/logger/
COPY packages/tokens/package.json packages/tokens/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
COPY packages/visuals/package.json packages/visuals/
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --ignore-scripts --filter runner

COPY packages/visuals packages/visuals
COPY apps/runner apps/runner

# Rootless Docker maps container root to the host user. The home volume is the only
# writable place besides the /tmp tmpfs the provisioner adds, so stay root and write there.
ENV HOME=/home/grid \
	XDG_DATA_HOME=/home/grid/.local/share \
	PATH="/home/grid/.local/bin:${PATH}" \
	RUNNER_HOST=0.0.0.0 \
	RUNNER_PORT=4100 \
	RUNNER_PROJECTS_DIR=/home/grid/Projects \
	RUNNER_SHARED=1

VOLUME ["/home/grid"]
EXPOSE 4100

CMD ["bun", "/grid/apps/runner/src/main.ts"]
