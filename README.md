# Mantis

Mantis is a small product-link collection with a Cloudflare Worker shell. The current UI validates links, prevents duplicates, stores queued cards in browser storage, and leaves product fields empty until extraction is connected.

## Run locally

```powershell
cd D:\Mantis
npm install
npm run check
npm run dev
```

Open the Vite URL, add an HTTP or HTTPS product link, and refresh the page to verify local persistence.

## Run through Wrangler

```powershell
npm run build
npx wrangler dev
```

The Worker health endpoint is available at `/api/health`.

## Validate a deployment

```powershell
npm run deploy:dry-run
```

This builds the UI and validates the Worker upload without changing the Cloudflare account.
