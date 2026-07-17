# Ollama Image Generation

Fashlock production never calls local Ollama. The production app only reads completed image URLs from Supabase. Your Mac runs a local worker that claims jobs, calls Ollama, uploads PNGs to Supabase Storage, and marks jobs completed.

## One-time setup

1. Run the migration in `database/020_image_generation_jobs.sql` in Supabase SQL Editor.
2. The migration creates or updates the public storage bucket:
   - name: `generated-fashion-images`
   - public: yes
   - mime type: `image/png`
   - cache control used by worker uploads: `31536000`
3. Add these environment variables locally:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
IMAGE_ADMIN_SECRET=...
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_IMAGE_MODEL=x/flux2-klein:4b
OLLAMA_IMAGE_SIZE=1024x1024
IMAGE_WORKER_ID=fashlock-local-mac
IMAGE_WORKER_POLL_MS=5000
```

The worker and enqueue script load `.env.local` and `.env` from the repository root. The worker uses `SUPABASE_SERVICE_ROLE_KEY`; never put that key in client code.

## Ollama

Install/pull the model on your Mac:

```bash
ollama pull x/flux2-klein:4b
ollama serve
```

The worker calls:

```text
POST http://127.0.0.1:11434/v1/images/generations
```

with:

```json
{
  "model": "x/flux2-klein:4b",
  "prompt": "...",
  "size": "1024x1024",
  "response_format": "b64_json"
}
```

## Enqueue jobs

Queue a few hero images:

```bash
npm run images:enqueue -- --limit 5
```

Queue women/men/hero images for one trend:

```bash
npm run images:enqueue -- --trend-id 123 --variant all
```

Useful flags:

```text
--limit 10
--variant trend_hero | trend_women | trend_men | deep_dive | daily_edit | all
--trend-id 123
--top-only
--force
```

## Run the local worker

```bash
npm run images:worker
```

The worker:

- checks Ollama is reachable before claiming a job
- processes one job at a time
- uploads to `generated-fashion-images/trends/{entityId}/{variant}/{promptHash}.png`
- stores the public URL in `generated_fashion_images`
- retries failed jobs until `max_attempts`

If your Mac or Ollama is off, production still works. Pending images simply fall back to existing Pexels/source/fallback images.

## Test one trend

1. Apply `database/020_image_generation_jobs.sql`.
2. Run `npm run images:enqueue -- --trend-id 123 --variant trend_hero`.
3. Run `npm run images:worker`.
4. Check `/api/admin/image-jobs?entityId=123&variant=trend_hero` with header `x-image-admin-secret: IMAGE_ADMIN_SECRET`.
5. Reload `/trends`; completed generated images take priority over Pexels for trend cards.
