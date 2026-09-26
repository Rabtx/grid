# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/nest-api/package.json ./apps/nest-api/
COPY apps/web/package.json ./apps/web/
COPY apps/docs/package.json ./apps/docs/
COPY packages/ui/package.json ./packages/ui/
COPY packages/logger/package.json ./packages/logger/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/db/package.json ./packages/db/
RUN bun install --frozen-lockfile

# Bun runs the TypeScript sources directly (as the launcher does), including the shared schema
# in packages/db, so there is no build step.
FROM oven/bun:${BUN_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN addgroup -S grid && adduser -S grid -G grid \
	&& apk add --no-cache wget

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY apps/nest-api/package.json apps/nest-api/tsconfig.json ./apps/nest-api/
COPY apps/nest-api/src ./apps/nest-api/src
COPY packages/typescript-config ./packages/typescript-config
COPY packages/db ./packages/db
COPY apps/nest-api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
	&& chown -R grid:grid /app

USER grid
WORKDIR /app/apps/nest-api

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
	CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "src/main.ts"]
