#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
	echo "[nest-api] running database migrations..."
	bun ../../packages/db/src/migrate.ts
fi

exec "$@"
