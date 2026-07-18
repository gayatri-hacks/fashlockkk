# Ollama Image Generation

Fashlock production never calls local Ollama. The production app only reads completed image URLs from Supabase. Your Mac runs a local worker that claims jobs, calls Ollama, validates candidates, uploads the selected file to Supabase Storage, and marks jobs completed.

## One-time setup

1. Run the migration in `database/020_image_generation_jobs.sql` in Supabase SQL Editor.
2. The migration creates or updates the public storage bucket:
   - name: `generated-fashion-images`
   - public: yes
   - mime type: `image/png` and `image/webp`
   - cache control used by worker uploads: `31536000`
3. Add these environment variables locally:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
IMAGE_ADMIN_SECRET=...
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_IMAGE_MODEL=x/flux2-klein:4b
OLLAMA_IMAGE_SIZE=1024x1024
OLLAMA_CONCEPT_IMAGE_SIZE=1024x1280
IMAGE_WORKER_WEBP_QUALITY=92
TREND_CONCEPT_CANDIDATE_COUNT=3
IMAGE_WORKER_ID=fashlock-local-mac
IMAGE_WORKER_POLL_MS=5000
```

Optional semantic validator:

```bash
IMAGE_VISION_VALIDATOR_URL=
IMAGE_VISION_VALIDATOR_KEY=
```

When `IMAGE_VISION_VALIDATOR_URL` is set, the worker sends each trend-concept candidate and its structured brief to that endpoint for strict JSON review. If the validator fails or is unavailable, the candidate fails closed and is not published.

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
--keyword "loose"
--formula "loose shirt + straight-leg jeans + loafers"
--occasion WORK
--gender women | men
--top-only
--force
```

For a deep-dive outfit card, enqueue the exact displayed formula. The lookup is formula-specific, so three outfit cards can have three different images:

```bash
npm run images:enqueue -- --trend-id 123 --variant trend_women --gender women --occasion WORK --formula "loose shirt + straight-leg jeans + loafers"
```

For searched keywords that are not stored in `trend_keywords`, use `--keyword`. The app uses the same deterministic synthetic id for that search term:

```bash
npm run images:enqueue -- --keyword "loose" --variant trend_women --gender women --occasion WORK --formula "loose shirt + straight-leg jeans + loafers"
```

## Run the local worker

```bash
npm run images:worker
```

The worker:

- checks Ollama is reachable before claiming a job
- processes one job at a time
- for `trend_concept`, generates three candidates, validates them, ranks the valid candidates, and publishes only the highest-scoring candidate
- rejects concept candidates with detected text, logo/watermark signals, person/anatomy signals, missing required cues, forbidden cues, weak fashion/material/composition scores or near-duplicate perceptual hashes
- keeps the existing production image when no candidate passes and marks the job `failed_review`
- uploads concept covers as WebP at quality 90-92 for textile detail when WebP conversion is available
- uploads to `generated-fashion-images/trends/{entityId}/{variant}/{promptHash}.webp` for validated concept covers or `.png` for non-concept images/fallback conversion
- stores the public URL in `generated_fashion_images`
- retries failed jobs until `max_attempts`

If your Mac or Ollama is off, production still works. Pending images simply fall back to existing Pexels/source/fallback images.

## Test one trend

1. Apply `database/020_image_generation_jobs.sql`.
2. Run `npm run images:enqueue -- --trend-id 123 --variant trend_hero`.
3. Run `npm run images:worker`.
4. Check `/api/admin/image-jobs?entityId=123&variant=trend_hero` with header `x-image-admin-secret: IMAGE_ADMIN_SECRET`.
5. Reload `/trends`; completed generated images take priority over Pexels for trend cards.

## Continuous Mac Worker

Optional `launchd` setup after the SQL migration is applied:

```bash
mkdir -p ~/Library/LaunchAgents
```

Create `~/Library/LaunchAgents/com.fashlock.images-worker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.fashlock.images-worker</string>
  <key>WorkingDirectory</key>
  <string>/Users/gayatrigajam/Library/Mobile Documents/com~apple~CloudDocs/fashiontrend-main/fashlock</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>npm</string>
    <string>run</string>
    <string>images:worker</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/fashlock-images-worker.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/fashlock-images-worker.err</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.fashlock.images-worker.plist
```

Stop it:

```bash
launchctl unload ~/Library/LaunchAgents/com.fashlock.images-worker.plist
```

## Controlled Trend-Concept Regeneration

Apply `database/024_trend_concept_image_review.sql` first. Then enqueue only the first-pass problem set, after reviewing the generated prompts and confirming you want to replace those cards:

```bash
npm run images:enqueue -- --keyword "graphic" --variant trend_concept --force
npm run images:enqueue -- --keyword "floral" --variant trend_concept --force
npm run images:enqueue -- --keyword "baggy" --variant trend_concept --force
npm run images:enqueue -- --keyword "minimal" --variant trend_concept --force
npm run images:enqueue -- --keyword "washed" --variant trend_concept --force
npm run images:enqueue -- --keyword "mini" --variant trend_concept --force
npm run images:enqueue -- --keyword "cropped" --variant trend_concept --force
npm run images:enqueue -- --keyword "oversized" --variant trend_concept --force
npm run images:enqueue -- --keyword "utility" --variant trend_concept --force
npm run images:enqueue -- --keyword "linen" --variant trend_concept --force
npm run images:enqueue -- --keyword "layering" --variant trend_concept --force
npm run images:enqueue -- --keyword "tailored" --variant trend_concept --force
npm run images:enqueue -- --keyword "flared" --variant trend_concept --force
```

Do not enqueue from `/trends` page views. Keep:

```bash
AUTO_ENQUEUE_TREND_IMAGES_ENABLED=false
```
