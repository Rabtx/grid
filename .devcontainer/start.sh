#!/usr/bin/env bash
# Runs each time the container starts: the tailnet (when there is a key), Postgres, then Grid in
# the background. Grid's log is .grid/grid.log; a second start while one runs exits on its own.
set -euo pipefail

# Join the tailnet so a home Grid can pair with this Codespace. Secrets reach lifecycle commands
# but not the container's entrypoint, so the login happens here. Tailscale keeps its hands off
# DNS and routes: the Codespace's own networking, and GitHub's connection to it, stay as they are.
if [ -n "${TS_AUTH_KEY:-}" ] && ! tailscale status >/dev/null 2>&1; then
	sudo tailscale up --auth-key="${TS_AUTH_KEY}" --hostname="${CODESPACE_NAME:-grid}" \
		--accept-dns=false --accept-routes=false ||
		echo "tailscale: could not join the tailnet; pairing stays off" >&2
fi

sudo service postgresql start >/dev/null
for _ in $(seq 1 30); do
	sudo -u postgres pg_isready -q && break
	sleep 1
done

# The role and database Grid's DATABASE_URL names, made once.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'grid'" | grep -q 1; then
	sudo -u postgres psql -qc "CREATE ROLE grid LOGIN PASSWORD 'grid'"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'grid'" | grep -q 1; then
	sudo -u postgres createdb -O grid grid
fi

mkdir -p .grid
setsid nohup bun run grid >.grid/grid.log 2>&1 &
