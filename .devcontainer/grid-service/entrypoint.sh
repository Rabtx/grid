#!/usr/bin/env bash
# Container start, from the container's own entrypoint (so it lives as long as the container);
# Codespaces runs that as the dev container user, a local build may run it as root. Lifecycle commands cannot keep anything running: whatever they leave in the
# background is killed when they finish. So start.sh only prepares the tailnet and Postgres and
# then marks the workspace ready; this keeps Grid running, as the dev container user, and starts
# it again if it stops. It must return at once, or the container never finishes starting.

workspace="${GRID_WORKSPACE:-/workspaces/grid}"
user="${GRID_USER:-vscode}"
ready="${workspace}/.grid/ready"

# A marker from the last run means nothing now: wait for this start's.
rm -f "${ready}"

(
	while :; do
		if [ -f "${ready}" ]; then
			command="cd '${workspace}' && exec bun run grid"
			if [ "$(id -un)" = "${user}" ]; then
				bash -lc "${command}"
			else
				runuser -u "${user}" -- bash -lc "${command}"
			fi >>"${workspace}/.grid/grid.log" 2>&1 </dev/null
			sleep 5
		else
			sleep 2
		fi
	done
) >/dev/null 2>&1 </dev/null &
