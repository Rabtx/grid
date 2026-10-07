#!/usr/bin/env bash
# Update the checkout Grid runs from to origin/main, build it, then restart the services that
# serve it. Started by the runner (Settings → Machines → Update & restart) through systemd-run, so
# it outlives the restart it ends with. Progress goes to a status file the runner reads.
#
#   GRID_UPDATE_UNITS   systemd user units to restart (default: grid-dev.service grid-pwa.service)
#   GRID_UPDATE_STATUS  where to write progress (default: $XDG_DATA_HOME/grid/update-status.json)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
data="${XDG_DATA_HOME:-$HOME/.local/share}/grid"
status="${GRID_UPDATE_STATUS:-$data/update-status.json}"
log="$data/logs/update.log"
read -r -a units <<<"${GRID_UPDATE_UNITS:-grid-dev.service grid-pwa.service}"
mkdir -p "$(dirname "$status")" "$(dirname "$log")"

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
from="$(git -C "$root" rev-parse --short HEAD)"
step="starting"

# One JSON object, written whole (to a temp file, then moved) so a reader never sees half of it.
write_status() {
    local state="$1" message="${2:-}" to="${3:-}" finished=""
    [[ "$state" == "running" ]] || finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    message="${message//\\/\\\\}"
    message="${message//\"/\\\"}"
    printf '{"state":"%s","step":"%s","startedAt":"%s","finishedAt":"%s","from":"%s","to":"%s","message":"%s"}\n' \
        "$state" "$step" "$started" "$finished" "$from" "$to" "$message" >"$status.tmp"
    mv "$status.tmp" "$status"
}

on_error() {
    write_status "failed" "Stopped while ${step}: see ${log}"
}
trap on_error ERR

{
    echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) updating ${root} from ${from}"

    step="fetching"
    write_status "running"
    git -C "$root" fetch --quiet origin main
    to="$(git -C "$root" rev-parse --short origin/main)"

    step="checking out"
    write_status "running" "" "$to"
    git -C "$root" checkout --quiet --detach origin/main

    step="installing"
    write_status "running" "" "$to"
    (cd "$root" && bun install)

    step="building"
    write_status "running" "" "$to"
    (cd "$root" && bun run build)

    step="restarting"
    write_status "done" "Updated from ${from} to ${to}; restarting" "$to"
    systemctl --user restart "${units[@]}"
    echo "== restarted ${units[*]}"
} >>"$log" 2>&1
