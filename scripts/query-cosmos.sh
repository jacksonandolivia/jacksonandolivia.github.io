#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${1:-wedding-rsvp-rg2}"
COSMOS_ACCOUNT="${2:-wedding-rsvp-cdb}"

CONNECTION_STRING=$(az cosmosdb keys list \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv)

cd /tmp && npm install @azure/cosmos --no-fund --no-audit 2>/dev/null

node -e "
const { CosmosClient } = require('@azure/cosmos');
const client = new CosmosClient('$CONNECTION_STRING');
client.database('wedding-rsvp').container('rsvps').items
  .query('SELECT c.householdId, c.submittedAt, c.guests[0].firstName, c.guests[0].lastName, c.guests[0].attending FROM c')
  .fetchAll()
  .then(r => console.log(JSON.stringify(r.resources, null, 2)));
"
