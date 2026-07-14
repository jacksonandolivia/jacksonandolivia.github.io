#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="wedding-rsvp-rg"
LOCATION="${1:-eastus}"
PASSWORD="${2:-}"

if [ -z "$PASSWORD" ]; then
  echo "Usage: $0 <location> <site-password>"
  echo ""
  echo "  location      Azure region (default: eastus)"
  echo "  site-password Password for the RSVP site"
  exit 1
fi

echo "==> Creating resource group: $RESOURCE_GROUP"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

echo "==> Deploying Bicep template"
outputs=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file main.bicep \
  --parameters sitePassword="$PASSWORD" \
  --query properties.outputs \
  --output json)

echo "$outputs" | jq -r 'to_entries[] | "\(.key): \(.value.value)"'

COSMOS_ACCOUNT=$(echo "$outputs" | jq -r '.cosmosAccountName_out.value')

echo "==> Getting Cosmos DB connection string"
CONNECTION_STRING=$(az cosmosdb keys list \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv)

echo "==> Setting connection string in Function App"
FUNCTION_APP=$(echo "$outputs" | jq -r '.functionAppName.value')

az functionapp config appsettings set \
  --name "$FUNCTION_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --settings COSMOS_CONNECTION_STRING="$CONNECTION_STRING" > /dev/null

echo ""
echo "==> Done!"
echo "Function App Name: $(echo "$outputs" | jq -r '.functionAppName.value')"
echo "Resource Group:    $RESOURCE_GROUP"
