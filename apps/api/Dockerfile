# syntax=docker/dockerfile:1
# The Grid API on its own (Render, a VPS). `bun run grid` / docker/grid.Dockerfile run the whole
# product instead. Bun runs the TypeScript sources directly, so there is no build step.

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/typescript-config/package.json ./packages/typescript-config/
RUN bun install --frozen-lockfile --filter api --filter @grid/db --production

FROM oven/bun:${BUN_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV GRID_UPLOADS_DIR=/data/uploads

RUN addgroup -S grid && adduser -S grid -G grid \
	&& apk add --no-cache wget \
	&& mkdir -p /data/uploads && chown -R grid:grid /data

# The installed tree, with each workspace's own node_modules links, then the sources over it.
COPY --from=deps /app ./
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src
COPY packages/typescript-config ./packages/typescript-config
COPY packages/db ./packages/db
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R grid:grid /app

USER grid
WORKDIR /app/apps/api
VOLUME /data

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
	CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "src/main.ts"]
