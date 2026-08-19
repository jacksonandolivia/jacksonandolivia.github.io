#!/usr/bin/env bash
set -euo pipefail

HOUSEHOLD_ID="${1:-}"
RESOURCE_GROUP="${2:-wedding-rsvp-rg2}"
COSMOS_ACCOUNT="${3:-wedding-rsvp-cdb}"

if [[ "$HOUSEHOLD_ID" == "--help" || "$HOUSEHOLD_ID" == "-h" ]]; then
  cat <<EOF
Usage: $(basename "$0") <householdId> [resourceGroup] [cosmosAccount]

Delete all RSVP records for a given household directly from Azure Cosmos DB.

Arguments:
  householdId      (required) The numeric householdId to delete RSVPs for.
  resourceGroup    (optional) Azure resource group name. Default: wedding-rsvp-rg2
  cosmosAccount    (optional) Cosmos DB account name.    Default: wedding-rsvp-cdb

Examples:
  $(basename "$0") 42
  $(basename "$0") 42 my-resource-group my-cosmos-account

Prerequisites:
  - Azure CLI (az) logged in with access to the Cosmos DB account
  - Node.js and npm available on PATH
EOF
  exit 0
fi

if [[ -z "$HOUSEHOLD_ID" ]]; then
  echo "Error: householdId is required."
  echo "Run '$(basename "$0") --help' for usage."
  exit 1
fi

echo "Fetching connection string for $COSMOS_ACCOUNT..."
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
const container = client.database('wedding-rsvp').container('rsvps');

async function run() {
  const householdId = parseInt('$HOUSEHOLD_ID', 10);

  // Find the document(s) with this householdId
  const { resources } = await container.items
    .query({
      query: 'SELECT c.id, c.householdId, c.submittedAt FROM c WHERE c.householdId = @hid',
      parameters: [{ name: '@hid', value: householdId }]
    })
    .fetchAll();

  if (resources.length === 0) {
    console.log('No RSVP found for householdId ' + householdId);
    process.exit(0);
  }

  console.log('Found ' + resources.length + ' RSVP(s) for householdId ' + householdId + ':');
  resources.forEach(r => console.log('  id=' + r.id + ' submittedAt=' + r.submittedAt));

  for (const doc of resources) {
    // Cosmos DB requires the partition key value; use householdId as string or number
    // Try both string and numeric partition key
    let partitionKey = doc.householdId !== undefined ? doc.householdId : householdId;
    await container.item(doc.id, partitionKey).delete();
    console.log('Deleted RSVP id=' + doc.id);
  }

  console.log('Done.');
}

run().catch(err => { console.error(err.message); process.exit(1); });
"
