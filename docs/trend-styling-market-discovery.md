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

## Migration and verification

Migrations 027, 028, and 029 are deployed prerequisites. The provider requires
the pending additive `database/030_repo_owned_market_discovery.sql` migration.
Do not run the workflow in execute mode before 030 passes review and is applied.

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
