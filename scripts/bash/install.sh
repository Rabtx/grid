#!/usr/bin/env bash
# Install Grid with one command, on Linux or macOS.
#
#   curl -fsSL https://grid-rho-ten.vercel.app/install.sh | bash
#       Grid itself on this machine: the console, API and runner behind one port (8080), with an
#       embedded database. Prints a one-time setup link that creates the owner account.
#
#   curl -fsSL https://grid-rho-ten.vercel.app/install.sh | bash -s -- runner
#       Only a runner, for a Grid you already have: this machine's terminals, files and agents,
#       reached over your Tailscale network. Prints the address and a pairing code to add it in
#       Settings → Environments on that Grid.
#
# Either way it installs Bun if it is missing, puts Grid in ~/.grid, adds a `grid` command to
# ~/.local/bin and keeps Grid running as a user service (systemd on Linux, launchd on macOS).
#
#   GRID_HOME          where Grid lives (default ~/.grid)
#   GRID_REPO          the repository to install from (default the public GitHub repository)
#   GRID_REF           the branch or tag (default main)
#   GRID_PORT          Grid's one port (default 8080)
#   GRID_RUNNER_PORT   the runner's port (default 4100)
#   GRID_PROJECTS_DIR  where project folders live (default ~/Projects)
#   GRID_NO_SERVICE=1  start in the background without a user service
set -euo pipefail

mode="${1:-grid}"
home="${GRID_HOME:-$HOME/.grid}"
repo="${GRID_REPO:-https://github.com/shabirkhan-dev/grid.git}"
ref="${GRID_REF:-main}"
app="$home/app"
bin="$HOME/.local/bin"

bold=$'\033[1m'
dim=$'\033[2m'
blue=$'\033[34m'
red=$'\033[31m'
reset=$'\033[0m'
[[ -t 1 ]] || { bold="" dim="" blue="" red="" reset=""; }

say() { printf '%s›%s %s\n' "$blue" "$reset" "$*"; }
fail() {
    printf '%serror:%s %s\n' "$red" "$reset" "$*" >&2
    exit 1
}

case "$mode" in
grid | runner) ;;
-h | --help | help)
    sed -n '2,24p' "${BASH_SOURCE[0]}" 2>/dev/null | sed 's/^# \{0,1\}//' || true
    exit 0
    ;;
*) fail "unknown mode '$mode': use 'grid' (the default) or 'runner'" ;;
esac

case "$(uname -s)" in
Linux | Darwin) ;;
*) fail "Grid installs on Linux and macOS. On Windows, run this inside WSL." ;;
esac

command -v git >/dev/null || fail "git is required. Install it (apt install git, brew install git…) and run this again."
command -v curl >/dev/null || fail "curl is required."

# A port something else already listens on would stop Grid from starting.
port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if [[ -f "$home/grid.env" ]] && ! grep -q "^GRID_MODE=$mode$" "$home/grid.env"; then
    fail "$home already holds a Grid of another kind. Use GRID_HOME=… to install this one elsewhere."
fi

# --- Bun -----------------------------------------------------------------------------------------
if ! command -v bun >/dev/null; then
    if [[ -x "$HOME/.bun/bin/bun" ]]; then
        export PATH="$HOME/.bun/bin:$PATH"
    else
        say "installing Bun"
        curl -fsSL https://bun.sh/install | bash >/dev/null
        export PATH="$HOME/.bun/bin:$PATH"
    fi
fi
bun_path="$(command -v bun)"

# --- Source --------------------------------------------------------------------------------------
mkdir -p "$home"
if [[ -d "$app/.git" ]]; then
    say "updating Grid in $app"
    git -C "$app" fetch --quiet --depth 1 origin "$ref"
    git -C "$app" checkout --quiet --force FETCH_HEAD
elif [[ "$mode" == runner ]]; then
    say "downloading the runner"
    # The runner needs only its own folder and the grid command: no dependencies to install.
    git clone --quiet --depth 1 --branch "$ref" --filter=blob:none --sparse "$repo" "$app"
    git -C "$app" sparse-checkout set apps/runner scripts/bash
else
    say "downloading Grid"
    git clone --quiet --depth 1 --branch "$ref" "$repo" "$app"
fi

if [[ "$mode" == grid ]]; then
    say "installing dependencies ${dim}(a minute or two the first time)${reset}"
    (cd "$app" && bun install --frozen-lockfile --ignore-scripts >/dev/null)
    say "building the console"
    (cd "$app/apps/console" && bun run build >/dev/null)
fi

# --- Settings ------------------------------------------------------------------------------------
# Written once and kept on reinstall, so changes made by hand survive an update.
if [[ ! -f "$home/grid.env" ]]; then
    port="${GRID_PORT:-8080}"
    runner_port="${GRID_RUNNER_PORT:-4100}"
    api_port="${GRID_API_PORT:-4000}"
    port_free "$runner_port" || fail "port $runner_port is in use. Set GRID_RUNNER_PORT to a free port and run this again."
    if [[ "$mode" == grid ]]; then
        port_free "$port" || fail "port $port is in use. Set GRID_PORT to a free port and run this again."
        port_free "$api_port" || fail "port $api_port is in use. Set GRID_API_PORT to a free port and run this again."
    fi
    cat >"$home/grid.env" <<EOF
GRID_MODE=$mode
GRID_HOME=$home
GRID_BUN=$bun_path
GRID_PORT=$port
GRID_API_PORT=$api_port
GRID_RUNNER_PORT=$runner_port
GRID_DATA_DIR=$home/data
GRID_PROJECTS_DIR=${GRID_PROJECTS_DIR:-$HOME/Projects}
EOF
    chmod 600 "$home/grid.env"
fi
mkdir -p "$home/data" "$home/logs"

# --- The grid command ----------------------------------------------------------------------------
mkdir -p "$bin"
if [[ -e "$bin/grid" && ! -L "$bin/grid" ]]; then
    say "$bin/grid already exists and is not Grid's; leaving it. Use $app/scripts/bash/grid.sh instead."
else
    ln -sfn "$app/scripts/bash/grid.sh" "$bin/grid"
fi
chmod +x "$app/scripts/bash/grid.sh"
grid="$app/scripts/bash/grid.sh"

# --- Start ---------------------------------------------------------------------------------------
if [[ "$mode" == runner ]] && ! tailscale status >/dev/null 2>&1; then
    "$grid" enable --no-start
    printf '\n%sThe runner is installed.%s It needs Tailscale to talk to your Grid:\n' "$bold" "$reset"
    printf '  1. install Tailscale: https://tailscale.com/download\n'
    printf '  2. tailscale up\n'
    printf '  3. grid start\n\n'
    exit 0
fi

GRID_NO_SERVICE="${GRID_NO_SERVICE:-}" "$grid" enable
say "starting"
"$grid" wait

printf '\n%sGrid is running.%s\n\n' "$bold" "$reset"
if [[ "$mode" == grid ]]; then
    "$grid" status
    link="$("$grid" setup-link 2>/dev/null || true)"
    if [[ -n "$link" ]]; then
        printf '\n  Create your account: %s%s%s\n' "$bold" "$link" "$reset"
    fi
else
    "$grid" pair
    printf '\n  On your Grid, open Settings → Environments and add this address with the code.\n'
fi

case ":$PATH:" in
*":$bin:"*) ;;
*) printf '\n  %sAdd %s to your PATH to use the grid command.%s\n' "$dim" "$bin" "$reset" ;;
esac
printf '\n  %sgrid status · grid logs · grid stop · grid update · grid help%s\n\n' "$dim" "$reset"
