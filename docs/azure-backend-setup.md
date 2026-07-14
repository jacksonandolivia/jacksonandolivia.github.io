# Azure Backend Setup

## Prerequisites

- Azure subscription
- [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) logged in (`az login`)
- Node.js 18+ (for local `npm install`)

---

## Automated Deployment (Recommended)

Use `scripts/deploy-azure.sh` for a single end-to-end deployment:

```bash
./scripts/deploy-azure.sh "your-site-password" centralus
```

This script handles all steps below automatically.

---

## Manual Step-by-Step

### 1. Create Resource Group

```bash
az group create --name wedding-rsvp-rg --location centralus
```

### 2. Deploy Infrastructure (Bicep)

```bash
az deployment group create \
  --resource-group wedding-rsvp-rg \
  --template-file infra/main.bicep \
  --parameters sitePassword="your-password" \
  --parameters cosmosConnectionString=""
```

This creates: Cosmos DB (free tier) + database + container, Storage account, Hosting Plan (Windows consumption Y1), and Function App.

### 3. Set Cosmos DB Connection String

After deployment, get the connection string and set it on the Function App:

```bash
COSMOS_ACCOUNT=$(az deployment group show --resource-group wedding-rsvp-rg --name main --query properties.outputs.cosmosAccountName_out.value -o tsv)
FUNCTION_APP=$(az deployment group show --resource-group wedding-rsvp-rg --name main --query properties.outputs.functionAppName.value -o tsv)

CONNECTION_STRING=$(az cosmosdb keys list \
  --name "$COSMOS_ACCOUNT" \
  --resource-group wedding-rsvp-rg \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv)

az functionapp config appsettings set \
  --name "$FUNCTION_APP" \
  --resource-group wedding-rsvp-rg \
  --settings COSMOS_CONNECTION_STRING="$CONNECTION_STRING"
```

### 4. Deploy API Code

```bash
cd api
npm install --omit=dev
zip -r /tmp/api-deploy.zip . -x "local.settings.json"
az functionapp deploy \
  --name "$FUNCTION_APP" \
  --resource-group wedding-rsvp-rg \
  --type zip \
  --src-path /tmp/api-deploy.zip
rm -rf node_modules /tmp/api-deploy.zip
```

### 5. Configure CORS

Allow the frontend origins (local dev and Static Web App):

```bash
az functionapp cors add \
  --name "$FUNCTION_APP" \
  --resource-group wedding-rsvp-rg \
  --allowed-origins "http://localhost:8000" "http://localhost:3000" "http://localhost:5500"
```

---

## Architecture Notes

| Aspect | Detail |
|--------|--------|
| **Function OS** | Windows consumption plan (Y1/Dynamic). Linux quota issues made Windows the reliable choice. |
| **Node version** | Set via `WEBSITE_NODE_DEFAULT_VERSION=~20`. Required by `@azure/cosmos` v4. |
| **Cosmos DB** | Free tier, single region, partition key `/householdId`. Only one free-tier account per subscription. |
| **API ↔ Frontend** | When deployed to Static Web Apps, API calls use relative paths (`/api/...`). For local dev against Azure, set `apiBaseUrl` in `config.json`. |

---

## API Functions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/submit-rsvp` | `sitePassword` in body | Submit or update an RSVP |
| GET | `/api/get-rsvp?householdId={id}` | None | Get RSVP for a household |
| GET | `/api/list-rsvps` | `x-admin-password` header | List all RSVPs (admin) |
| POST | `/api/verify-password` | None | Validate site password |

### POST `/api/submit-rsvp`

Validates payload, upserts to Cosmos DB. Finds existing document by `householdId`, replaces it (requires partition key in replace call), or creates new.

**Request:**
```json
{
  "householdId": 1,
  "sitePassword": "wedding2025",
  "guests": [
    {
      "guestId": 1,
      "firstName": "Chris",
      "lastName": "Wikle",
      "ageGroup": "adult",
      "attending": true,
      "meal": "chicken",
      "dietaryRestrictions": "no onions"
    }
  ]
}
```

**Response 201:** `{ "ok": true, "id": "abc123" }`

### GET `/api/list-rsvps`

Requires `x-admin-password` header set to the plaintext `SITE_PASSWORD` (not the SHA-256 admin hash from `config.json`).

**Response 200:**
```json
{ "ok": true, "rsvps": [{ "householdId": 1, "guests": [...], "submittedAt": "..." }] }
```

### POST `/api/verify-password`

Accepts `{ "password": "..." }`, returns `{ "ok": true }` or 401.

---

## Local Development with Azure Backend

To run the frontend locally (`npx serve src/`) but use the deployed Azure Functions:

1. Add `apiBaseUrl` to `src/data/config.json`:
   ```json
   "apiBaseUrl": "https://your-function-app.azurewebsites.net"
   ```
2. The Function App needs CORS configured for `http://localhost:3000` (or whatever port your local server uses)

To revert to localStorage-only mode (no API calls), set `apiBaseUrl` back to `""`.

---

## Querying Cosmos DB

Use `scripts/query-cosmos.sh` to view all RSVPs from the CLI:

```bash
./scripts/query-cosmos.sh
```

This temporarily installs `@azure/cosmos` in `/tmp` and runs a query returning householdId, submittedAt, guest name, and attending status.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `COSMOS_CONNECTION_STRING` | Cosmos DB connection string |
| `SITE_PASSWORD` | Password for site access (sent by frontend) |
| `ALLOWED_ORIGINS` | (Not currently used by functions — CORS set via Azure config) |

---

## Troubleshooting

**500 error on `submit-rsvp`:** Check that the partition key is provided in the Cosmos DB `replace()` call:
```js
await container.item(existingId, payload.householdId).replace(doc);
```

**Admin page not showing data in deployed mode:** Ensure `api.js` is loaded and `API.init()` is called before `Admin.init()`. The admin sends `config.sitePassword` as the `x-admin-password` header (not the hash).
