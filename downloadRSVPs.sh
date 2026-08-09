#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export API_BASE_URL="${API_BASE_URL:-https://wedding-rsvp-api-gxgqpye4chgds.azurewebsites.net}"
export SITE_PASSWORD="jando2026"

OUTPUT_PATH="${1:-$SCRIPT_DIR/rsvp-export.csv}"
POLL_INTERVAL="${RSVP_POLL_INTERVAL:-60}"

python3 "$SCRIPT_DIR/scripts/poll-rsvps.py" \
  --output "$OUTPUT_PATH" \
  --interval "$POLL_INTERVAL" \
  --timestamped