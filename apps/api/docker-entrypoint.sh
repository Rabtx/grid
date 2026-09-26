#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
	echo "[api] running database migrations..."
	bun ../../packages/db/src/migrate.ts
fi

# A Grid nobody has signed up to yet: print the one-time setup link (open it on WEB_APP_URL).
code=$(bun ../../packages/db/src/setup-code.ts | tail -n 1 | sed -n 's/.*"code":"\([^"]*\)".*/\1/p')
if [ -n "$code" ]; then
	echo "[api] set up this Grid: open ${WEB_APP_URL:-http://localhost:3000}/setup?code=${code}"
fi

exec "$@"
