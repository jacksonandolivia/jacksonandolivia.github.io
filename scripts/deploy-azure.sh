#!/usr/bin/env bash
# ============================================================
# Deploy Wedding RSVP to Azure (full end-to-end)
#
# Usage:
#   ./scripts/deploy-azure.sh <password> [location]
#
# Example:
#   ./scripts/deploy-azure.sh "wedding2025" centralus
#
# Prerequisites:
#   - Azure CLI (az) logged in with an active subscription
#   - Node.js 18+ (for npm install)
# ============================================================
# az group delete --name wedding-rsvp-rg --yes to clean up all resources created by this script

set -euo pipefail

PASSWORD="${1:?Usage: $0 <site-password> [location]}"
LOCATION="${2:-centralus}"
RG_NAME="wedding-rsvp-rg"
API_DIR="$(cd "$(dirname "$0")/../api" && pwd)"
INFRA_DIR="$(cd "$(dirname "$0")/../infra" && pwd)"

echo "================================================"
echo "  Wedding RSVP — Azure Deployment"
echo "================================================"
echo "Resource group:  $RG_NAME"
echo "Location:        $LOCATION"
echo "Password:        [hidden]"
echo ""

# Step 1: Create resource group
echo "==> [1/8] Creating resource group..."
az group create --name "$RG_NAME" --location "$LOCATION" --output none

# Step 2: Deploy infrastructure via Bicep
echo "==> [2/8] Deploying infrastructure (Cosmos DB, Storage, Function App)..."
az deployment group create \
  --resource-group "$RG_NAME" \
  --template-file "$INFRA_DIR/main.bicep" \
  --parameters sitePassword="$PASSWORD" \
  --parameters cosmosConnectionString="" \
  --output none

# Get resource names from deployment outputs
echo "==> [3/8] Capturing resource names..."
OUTPUTS=$(az deployment group show \
  --resource-group "$RG_NAME" \
  --name main \
  --query properties.outputs \
  --output json)

FUNCTION_APP=$(echo "$OUTPUTS" | jq -r '.functionAppName.value')
COSMOS_ACCOUNT=$(echo "$OUTPUTS" | jq -r '.cosmosAccountName_out.value')

echo "  Function App:  $FUNCTION_APP"
echo "  Cosmos DB:     $COSMOS_ACCOUNT"

# Step 4: Get Cosmos DB connection string
echo "==> [4/8] Retrieving Cosmos DB connection string..."
CONNECTION_STRING=$(az cosmosdb keys list \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RG_NAME" \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv)

# Step 5: Set connection string on Function App
echo "==> [5/8] Setting Cosmos DB connection string on Function App..."
az functionapp config appsettings set \
  --name "$FUNCTION_APP" \
  --resource-group "$RG_NAME" \
  --settings COSMOS_CONNECTION_STRING="$CONNECTION_STRING" > /dev/null

# Step 6: Install API dependencies and deploy code
echo "==> [6/8] Installing API dependencies..."
cd "$API_DIR"
npm install --omit=dev --no-fund --no-audit > /dev/null 2>&1

echo "==> [7/8] Deploying API code..."
DEPLOY_ZIP="/tmp/wedding-rsvp-api-deploy.zip"
zip -r "$DEPLOY_ZIP" . -x "local.settings.json" -x "node_modules/.cache/*" > /dev/null
az functionapp deploy \
  --name "$FUNCTION_APP" \
  --resource-group "$RG_NAME" \
  --type zip \
  --src-path "$DEPLOY_ZIP" > /dev/null
rm -f "$DEPLOY_ZIP"
rm -rf "$API_DIR/node_modules"

# Step 8: Configure CORS
echo "==> [8/8] Configuring CORS..."
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
