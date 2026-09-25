#!/usr/bin/env bash
# Runs each time the container starts: Postgres first, then Grid in the background.
# Grid's log is .grid/grid.log; a second start while one runs exits on its own.
set -euo pipefail

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
