# Trend Outfit Assets

This layer gives trend deep-dive cards a reviewed image cache and can optionally generate a live image through Ollama.

## Flow

1. Local batch script generates trend outfit images on your MacBook.
2. Each generated image is written into `trend_outfit_assets` with `status = pending`.
3. You review assets through the admin route.
4. Only `approved` assets are returned first by `/api/trends/generate-outfit`.
5. If no approved asset exists and `OLLAMA_IMAGE_ENABLED=true`, the route calls the configured Ollama image endpoint live.
6. If Ollama is disabled or unavailable, the route falls back to look library, product catalog, Pexels, then a final local default image.

## Table

`trend_outfit_assets`

- `trend_keyword`
- `normalized_trend_keyword`
- `outfit_formula`
- `outfit_title`
- `image_url`
- `image_source`
- `prompt`
- `status`
- `created_at`
- `updated_at`

## Generate locally

```bash
cd "/Users/gayatrigajam/Library/Mobile Documents/com~apple~CloudDocs/fashiontrend-main"
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export OLLAMA_IMAGE_ENABLED=true
export OLLAMA_IMAGE_MODEL="x/flux2-klein:4b"
export OLLAMA_IMAGE_API_URL="http://localhost:11434/api/generate"
export TREND_OUTFIT_ASSET_BUCKET="trend-outfits"
fashlock/scraper/.venv/bin/python scripts/generate_trend_outfit_assets_local.py --limit 12
```

Required env for live generation on your machine:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OLLAMA_IMAGE_ENABLED=true`
- `OLLAMA_IMAGE_MODEL=...`
- optional `OLLAMA_IMAGE_API_URL=...`
- `TREND_OUTFIT_ASSET_BUCKET=trend-outfits` defaults to `trend-outfits` when unset

## Live Production Generation

`/api/trends/generate-outfit` can call Ollama directly in production when these env vars are configured:

- `OLLAMA_IMAGE_ENABLED=true`
- `OLLAMA_IMAGE_MODEL=x/flux2-klein:4b`
- `OLLAMA_IMAGE_API_URL=https://your-reachable-ollama-host.example.com/api/generate`
- optional `OLLAMA_IMAGE_TIMEOUT_MS=180000`

Production cannot use your laptop's `http://localhost:11434` unless the app is deployed on the same machine as Ollama. For hosted production, expose Ollama through a private network, tunnel, or secured internal endpoint and set `OLLAMA_IMAGE_API_URL` to that reachable URL.

The live route still checks approved saved assets first. Live Ollama responses are returned directly as image data URLs with `imageSource = "ollama"` and are not automatically approved into the reviewed asset cache.

Optional:

- `TREND_OUTFIT_ASSET_BUCKET` to upload generated files to Supabase Storage

The local generator always saves a cache copy under:

`fashlock/public/trend-outfits/generated/`

When Supabase Storage is available, the script uploads each PNG to:

`<TREND_OUTFIT_ASSET_BUCKET>/<normalized_keyword>/<outfit_title>.png`

and writes the public Supabase Storage URL into `trend_outfit_assets.image_url`.

If the upload is unavailable, the local public-folder path remains the fallback.

## Review

List pending assets:

```bash
GET /api/admin/trend-outfit-assets?status=pending
```

Approve:

```bash
POST /api/admin/trend-outfit-assets
{
  "action": "approve",
  "ids": [1, 2, 3]
}
```

Reject:

```bash
POST /api/admin/trend-outfit-assets
{
  "action": "reject",
  "ids": [4]
}
```

## Live app behavior

`/api/trends/generate-outfit` now does this in order:

1. approved saved asset
2. look library image
3. product catalog image
4. Pexels image
5. final local fallback image

That keeps the Trends deep-dive cards instant and prevents `imageUrl: null` in production.
