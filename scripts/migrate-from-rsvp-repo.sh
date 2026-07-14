#!/usr/bin/env bash
# ============================================================
# Migrate backend infrastructure, API, scripts, and docs from
# the original wedding_website_RSVP repo into this repo.
#
# Usage:
#   ./scripts/migrate-from-rsvp-repo.sh [source-path]
#
# Default source: /home/jackson/source/wedding_website_RSVP
# ============================================================

set -euo pipefail

SRC="${1:-/home/jackson/source/wedding_website_RSVP}"
DEST="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$SRC" ]; then
  echo "Error: source directory not found: $SRC"
  exit 1
fi

echo "Source: $SRC"
echo "Dest:   $DEST"
echo ""

# ---- API (Azure Functions) ----
echo "==> Copying api/ ..."
mkdir -p "$DEST/api"
rsync -av --delete \
  --exclude='local.settings.json' \
  --exclude='node_modules' \
  --exclude='__pycache__' \
  "$SRC/api/" "$DEST/api/"

# ---- Infrastructure (Bicep) ----
echo "==> Copying infra/ ..."
mkdir -p "$DEST/infra"
rsync -av --delete "$SRC/infra/" "$DEST/infra/"

# ---- Scripts ----
echo "==> Copying scripts/ ..."
mkdir -p "$DEST/scripts"
rsync -av --delete \
  --exclude='git-push.sh' \
  "$SRC/scripts/" "$DEST/scripts/"

# ---- Docs ----
echo "==> Copying docs/ ..."
mkdir -p "$DEST/docs"
rsync -av --delete "$SRC/docs/" "$DEST/docs/"

# ---- Root-level config & data ----
echo "==> Copying root-level files ..."
cp "$SRC/staticwebapp.config.json" "$DEST/staticwebapp.config.json" 2>/dev/null || true
cp "$SRC/guest-list.csv" "$DEST/guest-list.csv" 2>/dev/null || true
cp "$SRC/weddingadminpassword.txt" "$DEST/weddingadminpassword.txt" 2>/dev/null || true

echo ""
echo "Done. Migrated backend infrastructure, API, scripts, and docs."
echo ""
echo "Next steps:"
echo "  1. Review and commit the new files: git add -A && git status"
echo "  2. If you want to keep local.settings.json, create it from"
echo "     the template in api/local.settings.json (it contains secrets)"
echo "  3. Run: npm install --prefix api to restore API dependencies"
echo "  4. Update data/config.json with the correct sitePassword if needed"
