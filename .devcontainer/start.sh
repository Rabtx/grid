#!/usr/bin/env bash
# Runs each time the container starts: joins the tailnet (when there is a key), starts Postgres,
# then marks the workspace ready. Grid itself is kept running by the grid-service feature, which
# waits for that mark: a lifecycle command cannot keep anything running once it returns.
set -euo pipefail

# Join the tailnet so a home Grid can pair with this Codespace. Secrets reach lifecycle commands
# but not the container's entrypoint, so the login happens here. Tailscale keeps its hands off
# DNS and routes: the Codespace's own networking, and GitHub's connection to it, stay as they are.
if [ -n "${TS_AUTH_KEY:-}" ] && ! tailscale status >/dev/null 2>&1; then
	sudo tailscale up --auth-key="${TS_AUTH_KEY}" --hostname="${CODESPACE_NAME:-grid}" \
		--accept-dns=false --accept-routes=false ||
		echo "tailscale: could not join the tailnet; pairing stays off" >&2
fi

# The dev container user may sudo to root without a password, but not straight to postgres, so
# Postgres commands go through root.
as_postgres() { sudo runuser -u postgres -- "$@"; }

sudo service postgresql start >/dev/null
for _ in $(seq 1 30); do
	pg_isready -q && break
	sleep 1
done

# The role and database Grid's DATABASE_URL names, made once.
if ! as_postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'grid'" | grep -q 1; then
	as_postgres psql -qc "CREATE ROLE grid LOGIN PASSWORD 'grid'"
fi
if ! as_postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'grid'" | grep -q 1; then
	as_postgres createdb -O grid grid
fi

# Keep Grid current: on main with nothing changed locally, take the latest before starting, so
# this environment runs the same Grid as the home one pairing with it. Anything else (a branch,
# local edits, no network) starts as it is.
if [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = main ] && [ -z "$(git status --porcelain 2>/dev/null)" ]; then
	if git pull --ff-only --quiet 2>/dev/null; then
		bun install --frozen-lockfile >/dev/null 2>&1 || echo "grid: bun install failed after updating" >&2
	else
		echo "grid: could not update from main; starting the Grid already here" >&2
	fi
fi

mkdir -p .grid
: >.grid/grid.log
touch .grid/ready
