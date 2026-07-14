param location string = resourceGroup().location
@secure()
param sitePassword string
param cosmosConnectionString string = ''

var storageAccountName = 'wedrsvp${uniqueString(resourceGroup().id)}'
var functionAppName = 'wedding-rsvp-api-${uniqueString(resourceGroup().id)}'
var cosmosAccountName = 'wedding-rsvp-${uniqueString(resourceGroup().id)}'

// --- Cosmos DB ---
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmosAccount
  name: 'wedding-rsvp'
  properties: {
    resource: { id: 'wedding-rsvp' }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDatabase
  name: 'rsvps'
  properties: {
    resource: {
      id: 'rsvps'
      partitionKey: {
        paths: ['/householdId']
        kind: 'Hash'
      }
    }
  }
}

// --- Storage for Function App ---
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
}

// --- Hosting Plan (must be before Function App) ---
resource hostingPlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: 'wedding-rsvp-plan-${uniqueString(resourceGroup().id)}'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
}

// --- Function App ---
resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: hostingPlan.id
    siteConfig: {
      appSettings: [
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}' }
        { name: 'COSMOS_CONNECTION_STRING', value: cosmosConnectionString }
        { name: 'SITE_PASSWORD', value: sitePassword }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
      ]
    }
    httpsOnly: true
  }
}

// --- Outputs ---
output functionAppName string = functionAppName
output cosmosAccountName_out string = cosmosAccount.name
output storageAccountName_out string = storageAccount.name
