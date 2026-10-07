#!/usr/bin/env bash
# Update Grid on this machine to origin/main: build the new version in a release of its own while
# the running one keeps serving, then switch over and restart. A failed install or build leaves the
# running version untouched. Started by the runner (Settings → Machines → Update) through
# systemd-run, so it outlives the restart it ends with. Progress goes to a status file.
#
# Layout, beside the checkout the services run from (`serve`):
#   serve      a link to the release in use; the systemd units run from it
#   releases/  one checkout per version built (the one in use and the one before it are kept)
#   shared/    what outlives a version: the API's .env, its uploads, the launcher's data
# The first update moves an existing `serve` checkout into releases/ and its state into shared/.
#
#   GRID_UPDATE_UNITS   systemd user units to restart (default: grid-dev.service grid-pwa.service)
#   GRID_UPDATE_STATUS  where to write progress (default: $XDG_DATA_HOME/grid/update-status.json)
set -euo pipefail

current="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
if [[ "$(basename "$(dirname "$current")")" == "releases" ]]; then
    base="$(dirname "$(dirname "$current")")"
else
    base="$(dirname "$current")"
fi
link="$base/serve"
releases="$base/releases"
shared="$base/shared"
# Kept outside any one release: secrets and data a new version must find where the old one left them.
persist=(apps/api/.env apps/api/uploads .grid)

data="${XDG_DATA_HOME:-$HOME/.local/share}/grid"
status="${GRID_UPDATE_STATUS:-$data/update-status.json}"
log="$data/logs/update.log"
read -r -a units <<<"${GRID_UPDATE_UNITS:-grid-dev.service grid-pwa.service}"
mkdir -p "$(dirname "$status")" "$(dirname "$log")" "$releases" "$shared"

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
from="$(git -C "$current" rev-parse --short HEAD)"
to=""
step="starting"
release=""
switched=false

# One JSON object, written whole (to a temp file, then moved) so a reader never sees half of it.
write_status() {
    local state="$1" message="${2:-}" finished=""
    [[ "$state" == "running" ]] || finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    message="${message//\\/\\\\}"
    message="${message//\"/\\\"}"
    printf '{"state":"%s","step":"%s","startedAt":"%s","finishedAt":"%s","from":"%s","to":"%s","message":"%s"}\n' \
        "$state" "$step" "$started" "$finished" "$from" "$to" "$message" >"$status.tmp"
    mv "$status.tmp" "$status"
}

on_error() {
    # Before the switch, the half-built release goes and the running version stays as it was.
    if [[ "$switched" == false && -n "$release" && -d "$release" ]]; then
        git -C "$current" worktree remove --force "$release" || rm -rf "$release"
        write_status "failed" "Stopped while ${step}; Grid is still running ${from}. See ${log}"
    else
        write_status "failed" "Stopped while ${step}. See ${log}"
    fi
}
trap on_error ERR

# What outlives a version lives in shared/; a release links to it. The first time, it moves there
# from the running checkout, which links back to it so the running version keeps finding it.
share() {
    local path="$1"
    if [[ ! -e "$shared/$path" && -e "$current/$path" && ! -L "$current/$path" ]]; then
        mkdir -p "$(dirname "$shared/$path")"
        mv "$current/$path" "$shared/$path"
        ln -s "$shared/$path" "$current/$path"
    fi
    if [[ -e "$shared/$path" ]]; then
        rm -rf "${release:?}/$path"
        mkdir -p "$(dirname "$release/$path")"
        ln -s "$shared/$path" "$release/$path"
    fi
}

{
    echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) updating from ${from} (${current})"

    step="fetching"
    write_status "running"
    git -C "$current" fetch --quiet origin main
    to="$(git -C "$current" rev-parse --short origin/main)"

    step="preparing"
    write_status "running"
    release="$releases/$to-$(date +%s)"
    git -C "$current" worktree add --quiet --detach "$release" origin/main
    for path in "${persist[@]}"; do share "$path"; done

    step="installing"
    write_status "running"
    (cd "$release" && bun install)

    step="building"
    write_status "running"
    (cd "$release" && bun run build)

    # The switch: `serve` points at the new release in one rename. A checkout still sitting at
    # `serve` (before the first update) moves into releases/; what runs from it keeps running.
    step="switching"
    write_status "running"
    if [[ -d "$link" && ! -L "$link" ]]; then
        git -C "$current" worktree move "$link" "$releases/$from-before"
        current="$releases/$from-before"
    fi
    ln -sfn "$release" "$link.next"
    mv -T "$link.next" "$link"
    switched=true

    step="restarting"
    write_status "done" "Updated from ${from} to ${to}; restarting"
    systemctl --user restart "${units[@]}"
    echo "== restarted ${units[*]} on ${release}"

    # Keep the release in use and the one before it (to switch back to); older ones go. Grid is
    # updated by now: a hitch here is logged, not reported as a failed update.
    trap - ERR
    set +e
    step="tidying"
    mapfile -t old < <(find "$releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +3 | cut -d' ' -f2-)
    for dir in "${old[@]}"; do
        [[ "$dir" == "$release" || "$dir" == "$current" ]] && continue
        git -C "$release" worktree remove --force "$dir" || rm -rf "$dir"
        echo "== removed old release ${dir}"
    done
    git -C "$release" worktree prune
} >>"$log" 2>&1
