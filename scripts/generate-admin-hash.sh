#!/usr/bin/env bash
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <admin-password>"
  echo ""
  echo "Generates a SHA-256 hash for the admin password."
  echo "Add the output to the 'adminPasswordHash' field in src/data/config.json"
  exit 1
fi

echo -n "$1" | sha256sum | cut -d' ' -f1
