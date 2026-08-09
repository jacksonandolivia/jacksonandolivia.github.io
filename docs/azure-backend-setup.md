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

This script handles all steps below automatically, including CORS configuration for local dev and the GitHub Pages production origin.

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

Allow the frontend origins (local dev and GitHub Pages):

```bash
az functionapp cors add \
  --name "$FUNCTION_APP" \
  --resource-group wedding-rsvp-rg \
  --allowed-origins "http://localhost:8000" "http://localhost:3000" "http://localhost:5500" "https://jacksonandolivia.github.io"
```

---

## Architecture Notes

| Aspect | Detail |
|--------|--------|
| **Function OS** | Windows consumption plan (Y1/Dynamic). |
| **Node version** | Set via `WEBSITE_NODE_DEFAULT_VERSION=~20`. |
| **Cosmos DB** | Free tier, single region, partition key `/householdId`. |
| **Frontend hosting** | GitHub Pages at `jacksonandolivia.github.io`. Static files served from repo root via Jekyll. |
| **API ↔ Frontend** | Frontend calls Azure Functions directly via CORS. Set `apiBaseUrl` in `data/config.json`. |

---

## Frontend Structure

```
jacksonandolivia.github.io/
├── index.html              Wedding homepage
├── RSVP/index.html         Guest RSVP form (SPA)
├── admin/index.html        Admin dashboard
├── css/style.css           Shared styles
├── js/                     JavaScript modules
├── data/                   Config + guest list
├── api/                    Azure Functions
├── infra/                  Bicep templates
├── scripts/                Deployment + utility scripts
└── docs/                   Documentation
```

### RSVP Data Behavior

```bash
python3 -m http.server 8000
```

| URL | Purpose |
|-----|---------|
| `http://localhost:8000/` | Wedding homepage |
| `http://localhost:8000/RSVP/` | Guest RSVP |
| `http://localhost:8000/admin/` | Admin dashboard |

### Local Testing

The frontend uses the Azure Functions API for RSVP reads and writes, including when
the static site is served from `localhost`. The browser does not cache RSVP data.
The login session is still kept in `sessionStorage` for the current browser session.

The `apiBaseUrl` value in `data/config.json` selects the Azure Functions API used by
the frontend.

---

## API Functions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/submit-rsvp` | `sitePassword` in body | Submit or update an RSVP |
| GET | `/api/get-rsvp?householdId={id}` | None | Get RSVP for a household |
| GET | `/api/list-rsvps` | `x-admin-password` header | List all RSVPs (admin) |
| POST | `/api/clear-rsvps` | `x-admin-password` header | Clear all RSVPs (admin) |

### POST `/api/submit-rsvp`

Validates payload, upserts to Cosmos DB. Finds existing document by `householdId`, replaces or creates new.

**Request:**
```json
{
  "householdId": 1,
  "sitePassword": "jando2026",
  "guests": [
    {
      "guestId": 1,
      "firstName": "Chris",
      "lastName": "Wikle",
      "ageGroup": "adult",
      "attending": true,
      "meal": "chicken-piccata",
      "dietaryRestrictions": "no onions",
      "email": "chris@example.com"
    }
  ]
}
```

`email` is optional per-guest. Only adults have email inputs on the RSVP form.

**Response 201:** `{ "ok": true, "id": "abc123" }`

### GET `/api/list-rsvps`

Requires `x-admin-password` header set to the plaintext `SITE_PASSWORD` (not the SHA-256 admin hash from `data/config.json`).

**Response 200:**
```json
{ "ok": true, "rsvps": [{ "householdId": 1, "guests": [...], "submittedAt": "..." }] }
```

### POST `/api/clear-rsvps`

Requires `x-admin-password` set to the plaintext `SITE_PASSWORD`. Deletes every RSVP document from the Cosmos DB `rsvps` container.

**Response 200:**
```json
{ "ok": true, "deleted": 12 }
```

Each guest includes: `guestId`, `firstName`, `lastName`, `ageGroup`, `attending`, `meal`, `dietaryRestrictions`, `email`.

---

## Deployment to Production

The frontend is deployed via GitHub Pages. Merge changes to the `main` branch of `jacksonandolivia.github.io`:

1. Update `data/config.json`:
   - Set `apiBaseUrl` to your Azure Functions URL (`https://{app}.azurewebsites.net`)
   - Set `sitePassword` to match the `SITE_PASSWORD` environment variable on the Function App
   - Generate `adminPasswordHash` using `scripts/generate-admin-hash.sh`
2. Push to `main` — GitHub Pages builds and deploys automatically
3. RSVP at `https://jacksonandolivia.github.io/RSVP/`
4. Admin at `https://jacksonandolivia.github.io/admin/`

---

## Guest Data

The guest list is compiled from `guest-list.csv`. To regenerate `data/guests.json`:

```bash
python3 scripts/generate-guest-data.py
```

The admin password hash in `data/config.json` can be generated with:

```bash
./scripts/generate-admin-hash.sh "your-admin-password"
```

---

## Querying Cosmos DB

Use `scripts/query-cosmos.sh` to view all RSVPs from the CLI:

```bash
./scripts/query-cosmos.sh
```

## Exporting RSVPs on a Loop

Use `scripts/poll-rsvps.py` to fetch the latest responses and keep a CSV file
updated whenever a response is added or changed. The script authenticates with
the plaintext site password required by `/api/list-rsvps`.

```bash
export SITE_PASSWORD="your-site-password"
export API_BASE_URL="https://{app}.azurewebsites.net"
python3 scripts/poll-rsvps.py --output rsvp-export.csv --interval 60
```

To export once and exit:

```bash
python3 scripts/poll-rsvps.py --once --output rsvp-export.csv
```

The CSV contains one row per guest, including household ID, submission time,
attendance, meal, dietary restrictions, and email.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `COSMOS_CONNECTION_STRING` | Cosmos DB connection string |
| `SITE_PASSWORD` | Password for API auth (sent by frontend as `sitePassword` in body or `x-admin-password` header) |
| `ALLOWED_ORIGINS` | (Not currently used by functions — CORS set via Azure CLI/config) |

---

## Troubleshooting

**500 error on `submit-rsvp`:** Check that the partition key is provided in the Cosmos DB `replace()` call:
```js
await container.item(existingId, payload.householdId).replace(doc);
```

**CORS errors on GitHub Pages:** Verify the Function App's CORS includes `https://jacksonandolivia.github.io`:
```bash
az functionapp cors show --name <function-app-name> --resource-group <rg-name>
az functionapp cors add --name <function-app-name> --resource-group <rg-name> --allowed-origins "https://jacksonandolivia.github.io"
```

**Admin page not showing data:** The admin sends `config.sitePassword` as the `x-admin-password` header. Ensure this matches the `SITE_PASSWORD` environment variable on the Function App.

**Emails not appearing in admin:** Old RSVPs won't have email data. Only new submissions after the email field was added will. The `list-rsvps` function must include `email` in its response (check `api/list-rsvps/index.js`).
