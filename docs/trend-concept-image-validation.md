# Trend Concept Image Validation

The `trend_concept` worker does not publish a generated candidate until the image bytes have been decoded and validated.

## Providers

- `IMAGE_GENERATION_PROVIDER=ollama` uses the local Ollama image API at `OLLAMA_BASE_URL`.
- `IMAGE_GENERATION_PROVIDER=cloudflare` uses Cloudflare Workers AI with `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and optional `CLOUDFLARE_IMAGE_MODEL`.

Cloudflare quota exhaustion stops the worker cleanly and leaves the job pending with `metadata.validationStatus=retryable_review` plus `metadata.retryAfter`. The existing production image is kept.

## Pixel Validation

Pixel checks use `sharp` to decode the generated image and compute:

- dimensions and 4:5 aspect ratio
- exposure and contrast
- sharpness
- dominant colour histogram
- pixel-derived perceptual hash

## OCR

OCR is required before a new concept image can be approved.

Configured options:

- `IMAGE_OCR_PROVIDER=local_tesseract`
- optional `IMAGE_OCR_MIN_CONFIDENCE` (default `0.72`)
- optional `IMAGE_OCR_MIN_WORD_LENGTH` (default `3`)
- optional `IMAGE_OCR_MIN_FRAGMENTS` (default `2`)
- optional `TESSERACT_LANG_PATH` if overriding the bundled English language data
- optional `TESSERACT_CACHE_PATH`
- `IMAGE_OCR_PROVIDER=http`
- `IMAGE_OCR_URL` for the optional HTTP provider only
- optional `IMAGE_OCR_KEY`

The local provider uses `tesseract.js` and the bundled `@tesseract.js-data/eng` package, so GitHub Actions and macOS do not download language data at runtime. The HTTP provider must return JSON:

```json
{
  "textDetected": false,
  "text": "",
  "confidence": 0.99,
  "boxes": [],
  "provider": "provider-name"
}
```

If OCR is unavailable, the candidate fails review safely.

## Semantic Vision

Semantic validation is required before approval.

Configured options:

- `IMAGE_SEMANTIC_VALIDATOR_PROVIDER=cloudflare`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_VISION_MODEL`
- optional `IMAGE_SEMANTIC_VALIDATOR_FALLBACK_PROVIDER=gemini`
- optional `GEMINI_API_KEY`
- optional `GEMINI_VISION_MODEL`
- `IMAGE_SEMANTIC_VALIDATOR_PROVIDER=gemini`
- `IMAGE_SEMANTIC_VALIDATOR_PROVIDER=http`
- `IMAGE_SEMANTIC_VALIDATOR_URL` or legacy `IMAGE_VISION_VALIDATOR_URL` for the optional HTTP provider only
- optional `IMAGE_SEMANTIC_VALIDATOR_KEY` or legacy `IMAGE_VISION_VALIDATOR_KEY`

The Cloudflare provider calls Workers AI directly, so no separate `IMAGE_SEMANTIC_VALIDATOR_URL` service is needed. The Gemini provider calls Gemini directly only when explicitly configured. The semantic provider receives the canonical keyword, structured brief and candidate image. It must return strict JSON with keyword, fashion, material, composition, text/logo and cue checks.

If semantic validation is unavailable, errors, times out or returns failing scores, the candidate remains unapproved and the current production image is retained.

## Cloud Worker Configuration

Cloud generation is disabled by default. To enable the optional GitHub Actions worker later:

- Set repository variable `ENABLE_CLOUD_IMAGE_WORKER=true`.
- Set repository variable `CLOUD_IMAGE_JOBS_PER_RUN=2` or another small sequential limit.
- Set repository variable `CLOUDFLARE_IMAGE_MODEL`.
- Set repository variable `CLOUDFLARE_VISION_MODEL`.
- Set repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
- Keep `IMAGE_OCR_PROVIDER=local_tesseract` unless deliberately using the optional HTTP OCR provider.
- Optionally set `IMAGE_SEMANTIC_VALIDATOR_FALLBACK_PROVIDER=gemini` and secret `GEMINI_API_KEY`.

Do not enable the cloud workflow until the queue is intentionally prepared; it never enqueues new image jobs by itself.
