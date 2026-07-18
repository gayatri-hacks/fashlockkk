# Multi-Region Trend Intelligence Handoff

## Audit Findings

- Active Trends UI: `app/trends/page.tsx`, `components/trends/trends-overview.tsx`, `components/trends/sections/trending-now.tsx`, `components/trends/sections/the-cycle.tsx`.
- Active overview data route: `app/api/trends/overview-data/route.ts`.
- Active search route: `app/api/trends/search/route.ts`.
- Existing top keyword path: `getTopTrendingKeywords("IN", ...)` in `lib/trend-velocity.ts`.
- Existing lifecycle implementations:
  - `trendVelocityLabel(score, comparisonScore)` in `lib/trend-velocity.ts`.
  - Local `cycleVelocityLabel(index,total)` in `app/api/trends/overview-data/route.ts`.
  - Search route ad hoc 3-month comparison in `app/api/trends/search/route.ts`.
  - Other prediction pages use separate velocity-only logic and were not made the source of truth here.
- Why a trend could disagree: featured cards used score vs comparison, while The Cycle sorted 50 keywords and split the list into thirds.
- Existing scheduler audit: `scraper/run_weekly.sh` is a local weekly-style shell script path-specific to another Mac user, and `app/api/cron/refresh-news/route.ts` only refreshes news. No production trend scheduler existed before `.github/workflows/monthly-trend-update.yml`.
- Existing generated-image enqueue: `scripts/enqueue-trend-images.ts`; page-view auto-enqueue is now gated behind `AUTO_ENQUEUE_TREND_IMAGES_ENABLED=true`.
- Google collection today:
  - `scraper/calculate_trends.py` reads existing `trend_keywords`, fetches Google Trends interest-over-time for India, and writes `trend_snapshots`.
  - `scraper/fetch_global_trends.py` reads existing `trend_keywords`, fetches historical interest-over-time by region, and writes `historical_trend_data`.
  - It does not collect Google related top/rising query suggestions as new keywords yet.

## Current Regional Coverage

Paginated read-only audit on July 18, 2026:

| Region | Rows | Earliest | Latest | Keywords |
| --- | ---: | --- | --- | ---: |
| AE | 13,450 | 2003-12-01 | 2026-04-01 | 50 |
| AU | 13,450 | 2003-12-01 | 2026-04-01 | 49 |
| BR | 12,615 | 2003-12-01 | 2026-04-01 | 44 |
| DE | 12,770 | 2003-12-01 | 2026-04-01 | 47 |
| FR | 13,450 | 2003-12-01 | 2026-04-01 | 48 |
| GB | 13,180 | 2003-12-01 | 2026-04-01 | 50 |
| IN | 13,180 | 2003-12-01 | 2026-04-01 | 48 |
| IT | 13,450 | 2003-12-01 | 2026-04-01 | 50 |
| JP | 13,180 | 2003-12-01 | 2026-04-01 | 46 |
| KR | 13,450 | 2003-12-01 | 2026-04-01 | 38 |
| SG | 13,450 | 2003-12-01 | 2026-04-01 | 45 |
| US | 13,450 | 2003-12-01 | 2026-04-01 | 46 |

Total: 159,075 rows. The table already contains non-India data.

## Database Design

Migration: `database/022_multi_region_trend_intelligence.sql`.

Additive tables:

- `trend_keyword_aliases`: raw keyword to canonical keyword traceability.
- `regional_trend_scores`: per-region normalized features and momentum by computation version.
- `global_trend_scores`: one canonical score/lifecycle/market classification per trend.
- `trend_editorial_names`: evidence-hash keyed display-name cache.
- `trend_pipeline_runs`: authenticated scheduled-run ledger and overlap guard.
- `trend_period_region_status`: per-region partial/complete/provider-not-ready month status.
- `trend_global_period_status`: global material-completion status for comparable periods.

Paste the full contents of `database/022_multi_region_trend_intelligence.sql` into Supabase SQL Editor. The migration is additive and does not delete historical rows or images.
Then paste `database/023_trend_period_finalization.sql` for month rollover/finalisation. It is also additive.

## Scoring Formula

Regional momentum:

```text
45% velocity percentile
25% current interest percentile
15% acceleration percentile
15% positive period persistence
```

Global score:

```text
40% India momentum
25% cross-region weighted median momentum
15% region breadth
10% fashion lead-market momentum
10% source confirmation
```

If India is missing, India momentum is not fabricated; the score is naturally lower and classification can become `coming_to_india`.

## Lifecycle Rules

One shared classifier returns `RISING`, `PEAKING`, `FADING`, `STABLE`, or `INSUFFICIENT_DATA`.

- Rising: positive weighted velocity, enough history, positive persistence, and acceleration or breadth.
- Peaking: high current-interest percentile and flattening/decelerating velocity.
- Fading: negative weighted velocity and negative recent persistence.
- Stable: evidence is valid but does not support the three public buckets.
- Insufficient data: weak history or support.

The Cycle no longer needs a third-split once the feature flag reads `global_trend_scores`.

## AI Refinement

File: `lib/trends/editorial-refinement.ts`.

Prompt is built from an evidence bundle only: raw variants, garments, silhouettes, materials, craft terms, colors, product/article phrases, regions, breadth, diversity, counts, period.

Schema:

```json
{
  "display_name": "string",
  "confidence": 0.0,
  "used_facets": ["string"],
  "reason": "short evidence-based explanation"
}
```

Output is validated with Zod and rejected if it uses unsupported facets. Evidence hash caching prevents reruns when evidence has not changed. If Gemini is disabled, unavailable, invalid, or rate-limited, deterministic fallback names are used.

## Feature Flags And Env

- `MULTI_REGION_TRENDS_ENABLED=true`: lets `/api/trends/overview-data` and `/api/trends/search` read precomputed multi-region tables.
- `AI_TREND_REFINEMENT_ENABLED=true`: allows offline/admin recomputation to call Gemini for display names.
- `MAX_AI_TRENDS_PER_RUN=8`: conservative default.
- `TREND_PIPELINE_SECRET` or `CRON_SECRET`: required for `/api/cron/recompute-trends`.
- `AUTO_ENQUEUE_TREND_IMAGES_ENABLED=true`: optional page-view image enqueue; default is off.
- `TREND_MARKETS=IN,US,GB,FR,IT,DE,JP,KR,AU,BR,SG,AE`: optional scraper region override.
- `FASHLOCK_PRODUCTION_URL=https://fashlockkk.vercel.app`: required by the GitHub Actions scheduler for the revalidate-only cron route.

## Permanent Scheduler

Workflow: `.github/workflows/monthly-trend-update.yml`.

Schedule:

```text
30 2 3,6,10,15 * *
```

This runs at 02:30 UTC, which is 08:00 IST, on the 3rd, 6th, 10th, and 15th of every month. The repeated monthly attempts let the provider lag for a few days without leaving the previous period permanently partial.

Scheduled production order:

```bash
npm run trends:verify-period-finalization
npm run trends:rollover -- --fail-on-incomplete
npm run trends:recompute -- --write --limit 75 --refine-names
curl -X POST "$FASHLOCK_PRODUCTION_URL/api/cron/revalidate-trends" \
  -H "Authorization: Bearer $TREND_PIPELINE_SECRET"
```

Manual workflow dispatch defaults to a no-write dry run:

```bash
npm run trends:rollover -- --dry-run
npm run trends:recompute -- --dry-run --limit 75 --refine-names
```

The workflow uses Node 20, Python 3.11, `npm ci`, `python -m pip install -r scraper/requirements.txt`, a 360-minute timeout, least-privilege `contents: read`, and a non-overlapping concurrency group. It explicitly sets `AUTO_ENQUEUE_TREND_IMAGES_ENABLED=false` and never passes `--enqueue-images`.

Required GitHub secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `TREND_PIPELINE_SECRET`
- `FASHLOCK_PRODUCTION_URL`

Optional repository variable:

- `TREND_MARKETS` defaults to `IN,US,GB,FR,IT,DE,JP,KR,AU,BR,SG,AE`.

## Commands

Read-only local preview:

```bash
npm run trends:recompute -- --dry-run --limit 20
```

Read-only rollover check for a date:

```bash
npm run trends:rollover -- --dry-run --as-of 2026-08-01
```

Verify Migration 023 tables/columns without writes:

```bash
npm run trends:verify-period-finalization
```

Inspect latest previous/current period status without writes:

```bash
npm run trends:period-status
```

Write computed scores after SQL migration:

```bash
npm run trends:recompute -- --write --limit 75
```

Finalize previous month and store the current month as partial:

```bash
npm run trends:rollover
```

Write with AI refinement:

```bash
AI_TREND_REFINEMENT_ENABLED=true npm run trends:recompute -- --write --limit 75 --refine-names
```

Write and enqueue only missing concept images for new canonical trends:

```bash
npm run trends:recompute -- --write --limit 75 --enqueue-images
```

Authenticated Vercel cron/admin call:

```bash
curl -X POST https://fashlockkk.vercel.app/api/cron/recompute-trends \
  -H "Authorization: Bearer $TREND_PIPELINE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false,"limit":75,"refineNames":true,"enqueueImages":false}'
```

Recommended cadence: the GitHub Actions monthly retry schedule after regional ingestion. AI refinement only runs for changed evidence within the per-run cap.
Scheduled production order:

```bash
npm run trends:rollover
npm run trends:recompute -- --write --limit 75 --refine-names
```

The unique historical upsert identity remains `keyword_id,month,market`.

`/trends` is revalidated by `app/api/cron/revalidate-trends/route.ts` after successful recomputation. This route only calls `revalidatePath`; it does not recompute the same data twice.

## Dry-Run Preview

Read-only dry-run computed 36 global candidates and selected the first 20. No AI calls were made.

| Keyword | Display | Lifecycle | Classification | Score |
| --- | --- | --- | --- | ---: |
| linen | Linen | RISING | cross_market_rising | 80.20 |
| maxi | Maxi Dresses | RISING | india_breakout | 75.15 |
| oversized | Oversized Shirts | STABLE | cross_market_rising | 74.48 |
| cropped | Cropped Shirts | RISING | cross_market_rising | 72.86 |
| loose | Loose Trousers | PEAKING | india_breakout | 71.99 |
| pleated | Pleated | STABLE | global_momentum | 71.01 |
| wide leg trousers | Wide-Leg Trousers | STABLE | cross_market_rising | 69.86 |
| floral | Floral Prints | PEAKING | cross_market_rising | 68.54 |
| mini | Mini | PEAKING | local_only | 63.32 |
| chinos | Chinos | STABLE | local_only | 63.31 |
| y2k | Y2K | STABLE | local_only | 62.94 |
| vintage | Vintage | RISING | global_momentum | 61.96 |
| quiet luxury | Quiet Luxury | RISING | local_only | 61.66 |
| utility | Utility | PEAKING | cross_market_rising | 61.16 |
| embroidered | Embroidered Shirt | STABLE | local_only | 60.35 |
| denim | Denim | RISING | cross_market_rising | 59.74 |
| printed | Printed | PEAKING | global_momentum | 59.09 |
| graphic | Graphic Prints | STABLE | local_only | 58.36 |
| color blocking | Color Blocking | STABLE | local_only | 57.94 |
| tailored | Tailoring | RISING | cross_market_rising | 57.46 |

## Production Safety Confirmations

- No migration was executed.
- No production write/backfill was run.
- No paid API call was made by tests or dry-run.
- No image job was enqueued.
- No existing trend image was overwritten.
- No commit or push was performed.

## Limitations

- Google related top/rising query discovery is still not implemented; current ingestion uses existing `trend_keywords` across regions.
- Source confirmation is limited to current product rows and `trend_candidate_evidence`; when evidence is thin, source weight is neutral or conservative.
- Supabase PostgREST does not expose `pg_catalog.pg_indexes` in this project, so the unique index catalog check reports skipped from the app layer. The production write path still uses `on_conflict=keyword_id,month,market`, which fails clearly if the unique index is missing.
- The new read path stays dormant until the SQL migration is run, `npm run trends:recompute -- --write ...` is executed, and `MULTI_REGION_TRENDS_ENABLED=true` is set.
