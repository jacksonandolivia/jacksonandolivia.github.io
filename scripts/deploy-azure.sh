#!/usr/bin/env bash
# ============================================================
# Deploy Wedding RSVP to Azure (full end-to-end)
#
# Usage:
#   ./scripts/deploy-azure.sh <password>
#
# Example:
#   ./scripts/deploy-azure.sh "jjh-omw-ames-nov7"
#
# Prerequisites:
#   - Azure CLI (az) logged in with an active subscription
#   - Node.js 18+ (for npm install)
# ============================================================
# az group delete --name wedding-rsvp-rg --yes to clean up all resources created by this script

set -euo pipefail

PASSWORD="${1:?Usage: $0 <site-password>}"
RG_NAME="wedding-rsvp-rg"
FUNCTION_APP="wedding-rsvp-api-gxgqpye4chgds"
COSMOS_RG_NAME="wedding-rsvp-rg2"
COSMOS_ACCOUNT="wedding-rsvp-cdb"
API_DIR="$(cd "$(dirname "$0")/../api" && pwd)"

echo "================================================"
echo "  Wedding RSVP — Azure Deployment"
echo "================================================"
echo "Resource group:  $RG_NAME"
echo "Function App:    $FUNCTION_APP"
echo "Password:        [hidden]"
echo ""

# Verify the existing app before deploying code.
echo "==> Verifying existing Function App..."
az functionapp show \
  --name "$FUNCTION_APP" \
  --resource-group "$RG_NAME" \
  --query name \
  --output tsv > /dev/null

echo "==> Reading existing Cosmos DB connection string..."
CONNECTION_STRING=$(az cosmosdb keys list \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$COSMOS_RG_NAME" \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv)

if [ -z "$CONNECTION_STRING" ]; then
  echo "ERROR: No connection string returned for $COSMOS_ACCOUNT in $COSMOS_RG_NAME." >&2
  exit 1
fi

echo "==> Updating existing Function App settings..."
az functionapp config appsettings set \
  --name "$FUNCTION_APP" \
  --resource-group "$RG_NAME" \
  --settings \
    COSMOS_CONNECTION_STRING="$CONNECTION_STRING" \
    SITE_PASSWORD="$PASSWORD" > /dev/null

# Install API dependencies and deploy the complete API directory, including
# api/clear-rsvps.
echo "==> Installing API dependencies..."
cd "$API_DIR"
npm install --omit=dev --no-fund --no-audit

echo "==> Deploying API code..."
DEPLOY_ZIP="/tmp/wedding-rsvp-api-deploy.zip"
cleanup() {
  rm -f "$DEPLOY_ZIP"
  rm -rf "$API_DIR/node_modules"
}
trap cleanup EXIT
zip -r "$DEPLOY_ZIP" . -x "local.settings.json" -x "node_modules/.cache/*" > /dev/null
az functionapp deployment source config-zip \
  --name "$FUNCTION_APP" \
  --resource-group "$RG_NAME" \
  --src "$DEPLOY_ZIP"

# Configure CORS on the existing app.
echo "==> Configuring CORS..."
az functionapp cors add \
  --name "$FUNCTION_APP" \
  --resource-group "$RG_NAME" \
  --allowed-origins "http://localhost:8000" "http://localhost:3000" "http://localhost:5500" "https://jacksonandolivia.github.io" \
  > /dev/null 2>&1 || true

echo ""
echo "================================================"
echo "  Deployment complete!"
echo "================================================"
echo ""
echo "Function App:  https://${FUNCTION_APP}.azurewebsites.net"
echo ""
echo "Frontend:"
echo "  RSVP:   https://jacksonandolivia.github.io/RSVP/"
echo "  Admin:  https://jacksonandolivia.github.io/admin/"
echo ""
echo "To test the API:"
echo "  curl -s https://${FUNCTION_APP}.azurewebsites.net/api/submit-rsvp \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"sitePassword\":\"${PASSWORD}\",\"householdId\":1,\"guests\":[{\"guestId\":1,\"firstName\":\"Test\",\"lastName\":\"User\",\"attending\":true,\"meal\":\"chicken\"}]}'"
echo ""
echo "To clean up and delete everything:"
echo "  az group delete --name $RG_NAME --yes"
