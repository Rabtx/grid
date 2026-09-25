#!/usr/bin/env bash
# Build time: put the service's entrypoint where the container's own entrypoint runs it.
set -euo pipefail
install -D -m 0755 "$(dirname "$0")/entrypoint.sh" /usr/local/share/grid-service/entrypoint.sh
