#!/usr/bin/env bash
# Container start, as root, from the container's own entrypoint (so it lives as long as the
# container). Lifecycle commands cannot keep anything running: whatever they leave in the
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
			runuser -u "${user}" -- bash -lc "cd '${workspace}' && exec bun run grid" \
				>>"${workspace}/.grid/grid.log" 2>&1 </dev/null
			sleep 5
		else
			sleep 2
		fi
	done
) >/dev/null 2>&1 </dev/null &
