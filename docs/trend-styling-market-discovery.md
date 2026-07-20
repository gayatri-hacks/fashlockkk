# Repo-owned styling market discovery

Arbitrary-keyword market discovery runs in the manually dispatched
`manual-trend-styling-research` GitHub Actions workflow on `ubuntu-latest`. It
does not require a developer machine, an application route, or another paid
market-interest service.

## Execution order

1. The manual TypeScript worker claims one `trend_style_research_jobs` row.
2. It reads a fresh 12-market result from `trend_style_market_evidence` when
   available.
3. On a cache miss, it executes `scraper/discover_keyword_markets.py` for the
   job's single canonical keyword.
4. The Python collector makes one cross-market Google Trends query and at most
   one timeline query per configured market, subject to the global call budget.
5. The worker validates the exact 12-market response and upserts it only into
   `trend_style_market_evidence`.
6. Only after three materially supported markets can be selected does the
   worker begin local-language styling evidence searches.

The collector never writes `trend_keywords`, `regional_trend_scores`,
`global_trend_scores`, or `historical_trend_data`.

## Limits and retries

- One keyword per worker run.
- Twelve configured markets: IN, US, GB, FR, IT, DE, JP, KR, AU, BR, SG, AE.
- Eighteen Google Trends calls maximum per keyword, including retries.
- Three attempts maximum per individual request.
- Twelve seconds between normal market requests.
- Exponential retry delays honour a bounded `Retry-After` response.
- A global rate limit opens a circuit and returns retry metadata for all twelve
  markets instead of attempting another twelve requests.
- The Python process timeout is six minutes; the GitHub job timeout is thirty
  minutes.

Complete results are cached for 24 hours. Partial/unavailable results expire at
their bounded retry window. The research job's `retry_after` prevents a cached
rate-limit result from consuming all job attempts immediately.

## Environment configuration

No market-discovery URL or token is required. Optional tuning variables are:

- `TREND_MARKET_DISCOVERY_MAX_PROVIDER_CALLS` (default `18`, hard cap `36`)
- `TREND_MARKET_DISCOVERY_MAX_ATTEMPTS` (default and hard cap `3`)
- `TREND_MARKET_DISCOVERY_REQUEST_DELAY_SECONDS` (default `12`)
- `TREND_MARKET_DISCOVERY_CACHE_TTL_HOURS` (default `24`)
- `TREND_MARKET_DISCOVERY_TIMEOUT_MS` (default `360000`, bounded to 1–15 minutes)
- `TREND_MARKET_DISCOVERY_CACHE_DIR` (default `.cache/trend-styling-market-discovery`)
- `TREND_MARKET_DISCOVERY_PYTHON` (default `python3`)

The manual workflow remains disabled by default. Formula-image enqueue remains
separately disabled unless explicitly selected in the manual dispatch.

## Controlled arbitrary-keyword test

The public `formula-search` enqueue path is not an operational entry point.
`TREND_SEARCH_RESEARCH_ENQUEUE_ENABLED` must remain `false` for public traffic
until authentication, per-user throttling, rate limiting, and abuse protection
are implemented and reviewed.

For a controlled `linen` test, manually dispatch `Manual trend styling
research` with `keyword=linen`, the intended market and season,
`create_job=true`, and `execute=true`. Those two explicit confirmations cause
the service-role worker to upsert one deterministic isolated concept and job,
then claim that exact job ID. Keep `enqueue_images=false` until the six approved
formulas and their evidence have been reviewed. Default and dry-run dispatches
perform no database writes and no provider calls.

## Migration and verification

Migrations 027, 028, 029, and 030 are deployed prerequisites. Before any
controlled execution, run the consolidated read-only verification and require
`all_styling_migration_checks_passed = true`. Production verification currently
passes all 31 checks.

Provider-free verification:

```sh
npm run trends:test-market-discovery
npm run trends:verify-styling-migrations
npm run test:trends
```

Optional read-only database catalog verification:

```sh
TREND_STYLING_PREFLIGHT_DATABASE_URL='postgresql://...' npm run trends:verify-styling-migrations -- --database
```
