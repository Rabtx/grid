#!/usr/bin/env bash
# The `grid` command an install puts in ~/.local/bin (see install.sh). It runs, starts and stops
# this machine's Grid — the whole of it, or only a runner — reading its settings from grid.env.
set -euo pipefail

self="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}")"
app="$(cd "$(dirname "$self")/../.." && pwd -P)"
home="${GRID_HOME:-$(dirname "$app")}"
[[ -f "$home/grid.env" ]] || {
    echo "No Grid is installed in $home." >&2
    exit 1
}
set -a
# shellcheck source=/dev/null
. "$home/grid.env"
set +a
mode="$GRID_MODE"
bun="${GRID_BUN:-bun}"
log="$home/logs/grid.log"
pidfile="$home/grid.pid"
name=grid
[[ "$mode" == runner ]] && name=grid-runner
unit="$name.service"
label="dev.$name"
plist="$HOME/Library/LaunchAgents/$label.plist"

has_systemd() { [[ "$(uname -s)" == Linux ]] && systemctl --user show-environment >/dev/null 2>&1; }
manager() {
    if [[ -f "$home/service" ]]; then cat "$home/service"; else echo background; fi
}

# This machine's tailnet address and name: the runner listens there and nowhere else.
tailnet_ip() { tailscale ip -4 2>/dev/null | head -n1; }
tailnet_name() {
    tailscale status --json 2>/dev/null | "$bun" -e \
        'const s = JSON.parse(await Bun.stdin.text()); console.log((s.Self?.DNSName ?? "").replace(/\.$/, ""))'
}

# The runner's own settings, for running it and for making pairing codes.
runner_env() {
    export RUNNER_PORT="$GRID_RUNNER_PORT"
    export RUNNER_PAIRING=1
    export RUNNER_CHAT_DB="$GRID_DATA_DIR/chat.db"
    export RUNNER_PROJECTS_DIR="$GRID_PROJECTS_DIR"
    export RUNNER_CWD="$GRID_PROJECTS_DIR"
}

run() {
    mkdir -p "$GRID_DATA_DIR" "$GRID_PROJECTS_DIR"
    if [[ "$mode" == grid ]]; then
        # The launcher itself, so stopping this process stops the API, runner and console with it.
        cd "$app/apps/launcher"
        exec "$bun" src/main.ts
    fi
    runner_env
    RUNNER_HOST="${GRID_RUNNER_HOST:-$(tailnet_ip)}"
    [[ -n "$RUNNER_HOST" ]] || {
        echo "[grid] this machine is not on a tailnet: run tailscale up, then grid start" >&2
        exit 1
    }
    export RUNNER_HOST
    cd "$app/apps/runner"
    exec "$bun" src/main.ts
}

enable() {
    local start=true
    [[ "${1:-}" == --no-start ]] && start=false
    if [[ -z "${GRID_NO_SERVICE:-}" ]] && has_systemd; then
        mkdir -p "$HOME/.config/systemd/user"
        cat >"$HOME/.config/systemd/user/$unit" <<EOF
[Unit]
Description=Grid ($mode)
After=network-online.target

[Service]
ExecStart=$self run
Restart=on-failure
RestartSec=5
KillMode=control-group
UMask=0077
StandardOutput=append:$log
StandardError=append:$log

[Install]
WantedBy=default.target
EOF
        systemctl --user daemon-reload
        if $start; then
            systemctl --user enable --now "$unit" >/dev/null 2>&1
        else
            systemctl --user enable "$unit" >/dev/null 2>&1
        fi
        echo systemd >"$home/service"
        # Keep Grid running while nobody is logged in; harmless where it is not allowed.
        loginctl enable-linger "$USER" >/dev/null 2>&1 || true
    elif [[ -z "${GRID_NO_SERVICE:-}" && "$(uname -s)" == Darwin ]]; then
        mkdir -p "$(dirname "$plist")"
        cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>$self</string><string>run</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$bun"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>$log</string>
  <key>StandardErrorPath</key><string>$log</string>
</dict>
</plist>
EOF
        echo launchd >"$home/service"
        $start && launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null || true
    else
        echo background >"$home/service"
        $start && start
    fi
    return 0
}

running() {
    case "$(manager)" in
    systemd) systemctl --user is-active --quiet "$unit" ;;
    launchd) launchctl print "gui/$(id -u)/$label" 2>/dev/null | grep -q 'state = running' ;;
    *) [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null ;;
    esac
}

start() {
    case "$(manager)" in
    systemd) systemctl --user start "$unit" ;;
    launchd) launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null || launchctl kickstart "gui/$(id -u)/$label" ;;
    *)
        running && return 0
        nohup "$self" run >>"$log" 2>&1 &
        echo $! >"$pidfile"
        ;;
    esac
}

stop() {
    case "$(manager)" in
    systemd) systemctl --user stop "$unit" ;;
    launchd) launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true ;;
    *)
        if [[ -f "$pidfile" ]]; then
            # The launcher stops the API, runner and console with it.
            kill "$(cat "$pidfile")" 2>/dev/null || true
            rm -f "$pidfile"
        fi
        ;;
    esac
}

url() {
    if [[ "$mode" == grid ]]; then
        echo "http://localhost:$GRID_PORT"
    else
        echo "http://$(tailnet_name):$GRID_RUNNER_PORT"
    fi
}

# Until Grid answers on its port, up to three minutes (the first start builds and migrates).
wait_ready() {
    local port="$GRID_PORT" host=127.0.0.1
    if [[ "$mode" == runner ]]; then
        port="$GRID_RUNNER_PORT"
        host="${GRID_RUNNER_HOST:-$(tailnet_ip)}"
    fi
    for _ in $(seq 1 180); do
        curl -s -o /dev/null "http://$host:$port/" && return 0
        running || {
            echo "Grid stopped while starting. The log ends with:" >&2
            tail -n 20 "$log" >&2
            exit 1
        }
        sleep 1
    done
    echo "Grid did not answer within three minutes; see grid logs." >&2
    exit 1
}

pair() {
    if [[ "$mode" == grid ]]; then
        cd "$app" && exec "$bun" run grid:pair
    fi
    runner_env
    cd "$app/apps/runner"
    "$bun" src/pair.ts
    echo "Address: $(url)"
}

update() {
    echo "Updating Grid…"
    git -C "$app" fetch --quiet --depth 1 origin "$(git -C "$app" rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/^HEAD$/main/')"
    git -C "$app" checkout --quiet --force FETCH_HEAD
    if [[ "$mode" == grid ]]; then
        (cd "$app" && "$bun" install --frozen-lockfile --ignore-scripts) >>"$home/logs/install.log" 2>&1
        (cd "$app/apps/console" && "$bun" run build) >>"$home/logs/install.log" 2>&1
    fi
    stop
    start
    wait_ready
    echo "Grid is up to date ($(git -C "$app" rev-parse --short HEAD))."
}

uninstall() {
    stop
    case "$(manager)" in
    systemd)
        systemctl --user disable "$unit" >/dev/null 2>&1 || true
        rm -f "$HOME/.config/systemd/user/$unit"
        systemctl --user daemon-reload
        ;;
    launchd) rm -f "$plist" ;;
    esac
    [[ "$(readlink "$HOME/.local/bin/grid" 2>/dev/null)" == "$self" ]] && rm -f "$HOME/.local/bin/grid"
    if [[ "${1:-}" == --purge ]]; then
        rm -rf "$home"
        echo "Grid and its data are removed."
    else
        rm -rf "$app" "$home/service" "$pidfile"
        echo "Grid is removed. Your data is kept in $home (grid uninstall --purge removes it too)."
    fi
}

usage() {
    cat <<EOF
grid — this machine's Grid ($mode)

  grid status       whether it is running, and where
  grid start        start it          grid stop      stop it
  grid restart      restart it        grid logs      follow its log
  grid pair         a one-time code for adding this machine to another Grid
EOF
    [[ "$mode" == grid ]] && echo "  grid setup-link   the link that creates the owner account, until someone uses it"
    cat <<EOF
  grid update       update to the latest version and restart
  grid uninstall    remove Grid (keeps its data; --purge removes that too)
EOF
}

case "${1:-help}" in
run) run ;;
enable) enable "${2:-}" ;;
start) start ;;
stop) stop ;;
restart)
    stop
    start
    ;;
wait) wait_ready ;;
status)
    if running; then
        echo "Grid ($mode) is running at $(url)"
    else
        echo "Grid ($mode) is stopped. Start it with: grid start"
        exit 3
    fi
    ;;
logs) tail -n 50 -f "$log" ;;
pair) pair ;;
setup-link)
    [[ "$mode" == grid && -f "$GRID_DATA_DIR/setup-link.txt" ]] || exit 1
    sed "s|^http://[^/]*|$(url)|" "$GRID_DATA_DIR/setup-link.txt"
    ;;
update) update ;;
uninstall) uninstall "${2:-}" ;;
help | -h | --help) usage ;;
*)
    usage >&2
    exit 1
    ;;
esac
