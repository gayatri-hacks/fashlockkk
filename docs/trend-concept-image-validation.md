# Trend Concept Image Validation

The `trend_concept` worker does not publish a generated candidate until the image bytes have been decoded and validated.

## Providers

- `IMAGE_GENERATION_PROVIDER=ollama` uses the local Ollama image API at `OLLAMA_BASE_URL`.
- `IMAGE_GENERATION_PROVIDER=cloudflare` uses Cloudflare Workers AI with `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and optional `CLOUDFLARE_IMAGE_MODEL`.

Cloudflare quota exhaustion returns the job to `retryable_review` with a `metadata.retryAfter` timestamp. The existing production image is kept.

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

- `IMAGE_OCR_PROVIDER=http`
- `IMAGE_OCR_URL`
- optional `IMAGE_OCR_KEY`

The OCR provider must return JSON:

```json
{
  "textDetected": false,
  "text": "",
  "confidence": 0.99,
  "provider": "provider-name"
}
```

If OCR is unavailable, the candidate fails review safely.

## Semantic Vision

Semantic validation is required before approval.

Configured options:

- `IMAGE_SEMANTIC_VALIDATOR_PROVIDER=http`
- `IMAGE_SEMANTIC_VALIDATOR_URL` or legacy `IMAGE_VISION_VALIDATOR_URL`
- optional `IMAGE_SEMANTIC_VALIDATOR_KEY` or legacy `IMAGE_VISION_VALIDATOR_KEY`

The semantic provider receives the canonical keyword, structured brief and candidate image. It must return strict JSON with keyword, fashion, material, composition, text/logo and cue checks.

If semantic validation is unavailable, errors, times out or returns failing scores, the candidate remains unapproved and the current production image is retained.
