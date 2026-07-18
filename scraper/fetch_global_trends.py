from __future__ import annotations
import argparse
import os, time, logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("global-trends")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

DEFAULT_MARKETS = ['IN', 'US', 'GB', 'FR', 'IT', 'DE', 'JP', 'KR', 'AU', 'BR', 'SG', 'AE']
MARKETS = [market.strip().upper() for market in os.getenv("TREND_MARKETS", ",".join(DEFAULT_MARKETS)).split(",") if market.strip()]

CHUNKS = [
    ("2004-01-01", "2008-12-31"),
    ("2008-07-01", "2013-12-31"),
    ("2013-07-01", "2018-12-31"),
    ("2018-07-01", "2023-12-31"),
    ("2023-07-01", "2026-05-01"),
]

MIN_FINALIZED_KEYWORD_RATIO = float(os.getenv("TREND_FINALIZATION_MIN_KEYWORD_RATIO", "0.6"))
MATERIAL_GLOBAL_COVERAGE_RATIO = float(os.getenv("TREND_MATERIAL_GLOBAL_COVERAGE_RATIO", "0.8"))
PARTIAL_FRESH_HOURS = float(os.getenv("TREND_PARTIAL_FRESH_HOURS", "20"))

def parse_args():
    parser = argparse.ArgumentParser(description="Fetch historical Google Trends signals.")
    parser.add_argument("--rollover", action="store_true", help="Finalize the preceding month and collect the current month as partial data.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and log work without writing Supabase rows.")
    parser.add_argument("--as-of", help="Override today's date as YYYY-MM-DD for rollover testing.")
    parser.add_argument("--fail-on-incomplete", action="store_true", help="Exit non-zero when the previous month is not materially complete.")
    return parser.parse_args()

def month_start(value: date) -> date:
    return date(value.year, value.month, 1)

def add_months(value: date, months: int) -> date:
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    return date(year, month, 1)

def enumerate_months_after(start_exclusive: date | None, end_inclusive: date) -> list[date]:
    if start_exclusive is None:
        return [end_inclusive]
    months = []
    cursor = add_months(start_exclusive, 1)
    while cursor <= end_inclusive:
        months.append(cursor)
        cursor = add_months(cursor, 1)
    return months

def month_window(period_month: date, as_of: date, complete: bool) -> tuple[str, str]:
    start = period_month
    if complete:
        end = add_months(period_month, 1) - timedelta(days=1)
    else:
        end = max(start, as_of)
    return start.isoformat(), end.isoformat()

def retry_after_iso(hours: int = 24) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()

def parse_iso_datetime(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None

def get_supabase():
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key)

def fetch_chunk(pytrends, keywords, start, end, geo, gprop=""):
    try:
        pytrends.build_payload(keywords, cat=0, timeframe=f"{start} {end}", geo=geo, gprop=gprop)
        data = pytrends.interest_over_time()
        if data.empty:
            return pd.DataFrame()
        if "isPartial" in data.columns:
            data = data.drop(columns=["isPartial"])
        return data
    except Exception as e:
        logger.warning("Failed chunk %s to %s geo=%s: %s", start, end, geo, e)
        return pd.DataFrame()

def existing_period_state(client, region: str, period_month: date):
    try:
        result = (
            client.table("trend_period_region_status")
            .select("period_status, attempted_at, retry_after")
            .eq("region", region)
            .eq("period_month", period_month.isoformat())
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None
    except Exception as e:
        logger.warning("Could not read period status for %s %s: %s", region, period_month, e)
        return None

def existing_period_status(client, region: str, period_month: date):
    state = existing_period_state(client, region, period_month)
    return state.get("period_status") if state else None

def fetch_all_rows(query_factory, page_size: int = 1000):
    rows = []
    start = 0
    while True:
        result = query_factory(start, start + page_size - 1).execute()
        batch = result.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows

def fetch_all_period_statuses(client):
    try:
        return fetch_all_rows(lambda start, end: (
            client.table("trend_period_region_status")
            .select("region, period_month, period_status, attempted_at, retry_after")
            .range(start, end)
        ))
    except Exception as e:
        logger.warning("Could not read period status ledger: %s", e)
        return []

def coverage_from_period_statuses(statuses: list[dict]):
    grouped: dict[str, set[str]] = {}
    for status in statuses:
        if status.get("period_status") != "complete":
            continue
        period_month = str(status.get("period_month") or "")
        region = str(status.get("region") or "").upper()
        if period_month and region:
            grouped.setdefault(period_month, set()).add(region)
    return [
        {"period_month": month, "complete_regions": sorted(regions)}
        for month, regions in grouped.items()
    ]

def fetch_historical_period_coverages(client, *, current_month: date, keyword_count: int, regions: list[str]):
    region_set = {region.upper() for region in regions}
    min_keywords = max(1, int(keyword_count * MIN_FINALIZED_KEYWORD_RATIO))
    grouped: dict[tuple[str, str], set[int]] = {}
    try:
        rows = fetch_all_rows(lambda start, end: (
            client.table("historical_trend_data")
            .select("market, month, keyword_id, period_status")
            .lt("month", current_month.isoformat())
            .range(start, end)
        ))
    except Exception as e:
        logger.warning("Could not read historical period coverage: %s", e)
        return []

    for row in rows:
        region = str(row.get("market") or "").upper()
        month = str(row.get("month") or "")
        if region not in region_set or not month:
            continue
        if row.get("period_status") == "partial":
            continue
        try:
            keyword_id = int(row.get("keyword_id"))
        except (TypeError, ValueError):
            continue
        grouped.setdefault((month, region), set()).add(keyword_id)

    month_regions: dict[str, set[str]] = {}
    for (month, region), keyword_ids in grouped.items():
        if len(keyword_ids) >= min_keywords:
            month_regions.setdefault(month, set()).add(region)

    return [
        {"period_month": month, "complete_regions": sorted(regions)}
        for month, regions in month_regions.items()
    ]

def latest_materially_complete_month(coverages: list[dict], *, current_month: date, regions: list[str]):
    expected_regions = {region.upper() for region in regions}
    candidates = sorted(
        [coverage for coverage in coverages if str(coverage.get("period_month") or "") < current_month.isoformat()],
        key=lambda coverage: str(coverage.get("period_month") or ""),
        reverse=True,
    )
    for coverage in candidates:
        complete_regions = {str(region).upper() for region in coverage.get("complete_regions", [])}
        coverage_ratio = len(expected_regions & complete_regions) / max(1, len(expected_regions))
        if coverage_ratio >= MATERIAL_GLOBAL_COVERAGE_RATIO:
            return datetime.strptime(str(coverage["period_month"]), "%Y-%m-%d").date()
    return None

def build_catch_up_plan(client, *, as_of: date, keyword_count: int):
    current_month = month_start(as_of)
    latest_closed_month = add_months(current_month, -1)
    ledger_rows = fetch_all_period_statuses(client)
    historical_coverages = None
    if ledger_rows:
        coverage_source = "period_ledger"
        coverages = coverage_from_period_statuses(ledger_rows)
    else:
        coverage_source = "historical_trend_data"
        historical_coverages = fetch_historical_period_coverages(
            client,
            current_month=current_month,
            keyword_count=keyword_count,
            regions=MARKETS,
        )
        coverages = historical_coverages
    latest_complete = latest_materially_complete_month(
        coverages,
        current_month=current_month,
        regions=MARKETS,
    )
    if ledger_rows and latest_complete is None:
        coverage_source = "historical_trend_data"
        historical_coverages = historical_coverages or fetch_historical_period_coverages(
            client,
            current_month=current_month,
            keyword_count=keyword_count,
            regions=MARKETS,
        )
        latest_complete = latest_materially_complete_month(
            historical_coverages,
            current_month=current_month,
            regions=MARKETS,
        )
    closed_months = enumerate_months_after(latest_complete, latest_closed_month)
    status_by_region_month = {
        (str(row.get("region") or "").upper(), str(row.get("period_month") or "")): row
        for row in ledger_rows
    }
    plan = {
        "current_month": current_month,
        "latest_closed_month": latest_closed_month,
        "latest_complete_month": latest_complete,
        "coverage_source": coverage_source,
        "closed_months": closed_months,
        "status_by_region_month": status_by_region_month,
    }
    logger.info(
        "Catch-up plan: source=%s latest_complete=%s closed_complete=%s current_partial=%s regions=%s",
        coverage_source,
        latest_complete,
        [month.isoformat() for month in closed_months],
        current_month,
        MARKETS,
    )
    return plan

def state_retry_pending(state) -> bool:
    retry_after = parse_iso_datetime(state.get("retry_after") if state else None)
    return bool(retry_after and retry_after > datetime.now(timezone.utc))

def partial_period_is_fresh(state) -> bool:
    if not state or state.get("period_status") != "partial":
        return False
    attempted_at = parse_iso_datetime(state.get("attempted_at"))
    if not attempted_at:
        return False
    age_hours = (datetime.now(timezone.utc) - attempted_at).total_seconds() / 3600
    return age_hours < PARTIAL_FRESH_HOURS

def upsert_period_status(
    client,
    *,
    region: str,
    period_month: date,
    period_status: str,
    provider_ready: bool,
    row_count: int,
    keyword_count: int,
    error_message: str | None = None,
    dry_run: bool = False,
):
    payload = {
        "region": region,
        "period_month": period_month.isoformat(),
        "period_status": period_status,
        "expected_period_end": add_months(period_month, 1).isoformat(),
        "provider_ready": provider_ready,
        "row_count": row_count,
        "keyword_count": keyword_count,
        "attempted_at": datetime.now(timezone.utc).isoformat(),
        "finalized_at": datetime.now(timezone.utc).isoformat() if period_status == "complete" else None,
        "retry_after": retry_after_iso() if period_status in ("provider_not_ready", "failed") else None,
        "error_message": error_message,
        "computation_version": "multi-region-v1",
        "metadata": {
            "source": "pytrends",
            "identity": "keyword_id,month,market",
        },
    }
    if dry_run:
        logger.info("[dry-run] period status: %s", payload)
        return payload
    client.table("trend_period_region_status").upsert(payload, on_conflict="region,period_month").execute()
    return payload

def fetch_period_statuses(client, period_month: date):
    try:
        result = (
            client.table("trend_period_region_status")
            .select("region, period_month, period_status")
            .eq("period_month", period_month.isoformat())
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.warning("Could not read period statuses for %s: %s", period_month, e)
        return []

def upsert_global_period_status(client, *, period_month: date, current_month: date, dry_run: bool, status_rows: list[dict] | None = None):
    rows = [
        row for row in (status_rows if status_rows is not None else fetch_period_statuses(client, period_month))
        if row.get("period_month") == period_month.isoformat()
    ]
    expected_regions = sorted(MARKETS)
    complete_regions = sorted({
        str(row.get("region", "")).upper()
        for row in rows
        if row.get("period_status") == "complete" and str(row.get("region", "")).upper() in expected_regions
    })
    missing_regions = sorted([region for region in expected_regions if region not in complete_regions])
    coverage_ratio = len(complete_regions) / max(1, len(expected_regions))
    is_materially_complete = coverage_ratio >= 0.8
    status = "partial" if period_month == current_month else ("complete" if is_materially_complete else "incomplete")
    payload = {
        "period_month": period_month.isoformat(),
        "period_status": status,
        "expected_regions": expected_regions,
        "complete_regions": complete_regions,
        "missing_regions": missing_regions,
        "material_coverage_ratio": round(coverage_ratio, 4),
        "is_materially_complete": is_materially_complete,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "metadata": {"source": "fetch_global_trends.py --rollover"},
    }
    if dry_run:
        logger.info("[dry-run] global period status: %s", payload)
        return payload
    client.table("trend_global_period_status").upsert(payload, on_conflict="period_month").execute()
    return payload

def fetch_period_dataframe(pytrends, keywords: list[str], period_month: date, as_of: date, region: str, complete: bool):
    start, end = month_window(period_month, as_of, complete)
    batches = []
    for i in range(0, len(keywords), 5):
        batch = keywords[i:i + 5]
        logger.info("  Period %s batch %s geo=%s complete=%s", period_month, batch, region, complete)
        df = fetch_chunk(pytrends, batch, start, end, geo=region)
        if not df.empty:
            batches.append(df)
        time.sleep(12)
    if not batches:
        return pd.DataFrame()
    merged = pd.concat(batches, axis=1)
    return merged.resample("MS").mean()

def build_period_records(keyword_lookup, dataframe: pd.DataFrame, period_month: date, region: str, complete: bool):
    records = []
    if dataframe.empty:
        return records
    for keyword, kw_id in keyword_lookup.items():
        if keyword not in dataframe.columns:
            continue
        series = dataframe[keyword].dropna()
        if series.empty:
            continue
        score = float(series.mean())
        records.append({
            "keyword_id": kw_id,
            "month": period_month.isoformat(),
            "google_score": round(score, 2),
            "market": region,
            "period_status": "complete" if complete else "partial",
            "period_finalized_at": datetime.now(timezone.utc).isoformat() if complete else None,
            "provider_finalized_at": datetime.now(timezone.utc).isoformat() if complete else None,
        })
    return records

def save_records(client, records: list[dict], dry_run: bool):
    if not records:
        return
    if dry_run:
        logger.info("[dry-run] would upsert %d historical_trend_data rows", len(records))
        return
    for j in range(0, len(records), 500):
        client.table("historical_trend_data").upsert(
            records[j:j + 500],
            on_conflict="keyword_id,month,market",
        ).execute()

def run_rollover(client, *, as_of: date, dry_run: bool, fail_on_incomplete: bool):
    from pytrends.request import TrendReq

    keywords_data = client.table("trend_keywords").select("id, keyword").execute().data or []
    if not keywords_data:
        logger.error("No keywords found")
        return 1

    keyword_lookup = {row["keyword"]: row["id"] for row in keywords_data}
    keywords = list(keyword_lookup.keys())
    plan = build_catch_up_plan(client, as_of=as_of, keyword_count=len(keyword_lookup))
    current_month = plan["current_month"]
    closed_months = plan["closed_months"]
    status_by_region_month = plan["status_by_region_month"]
    pytrends = TrendReq(hl="en-US", tz=330, timeout=(10, 30), retries=3, backoff_factor=1.0)
    period_status_rows = []
    closed_global_statuses = []
    summary = {
        "closed_finalized": [],
        "current_partial": [],
        "provider_not_ready": [],
        "failed": [],
        "already_complete": [],
        "retry_not_due": [],
    }

    logger.info(
        "Rollover as_of=%s latest_closed=%s closed_complete=%s current_partial=%s",
        as_of,
        plan["latest_closed_month"],
        [month.isoformat() for month in closed_months],
        current_month,
    )

    def remember_status(payload):
        if not payload:
            return
        period_status_rows.append(payload)
        region = str(payload.get("region") or "").upper()
        period_month = str(payload.get("period_month") or "")
        if region and period_month:
            status_by_region_month[(region, period_month)] = payload

    for period_month in closed_months:
        for market in MARKETS:
            state = status_by_region_month.get((market, period_month.isoformat()))
            if state and state.get("period_status") == "complete":
                logger.info("Finalized period already complete for %s %s; skipping", market, period_month)
                summary["already_complete"].append(f"{period_month.isoformat()}:{market}")
                remember_status({
                    "region": market,
                    "period_month": period_month.isoformat(),
                    "period_status": "complete",
                })
            elif state and state_retry_pending(state):
                logger.info("Retry is not due yet for %s %s; skipping until %s", market, period_month, state.get("retry_after"))
                summary["retry_not_due"].append(f"{period_month.isoformat()}:{market}")
                remember_status({
                    "region": market,
                    "period_month": period_month.isoformat(),
                    "period_status": state.get("period_status"),
                })
            else:
                try:
                    df = fetch_period_dataframe(pytrends, keywords, period_month, as_of, market, complete=True)
                    records = build_period_records(keyword_lookup, df, period_month, market, complete=True)
                    keyword_count = len({record["keyword_id"] for record in records})
                    provider_ready = keyword_count >= max(1, int(len(keyword_lookup) * MIN_FINALIZED_KEYWORD_RATIO))
                    if provider_ready:
                        save_records(client, records, dry_run)
                        status_payload = upsert_period_status(
                            client,
                            region=market,
                            period_month=period_month,
                            period_status="complete",
                            provider_ready=True,
                            row_count=len(records),
                            keyword_count=keyword_count,
                            dry_run=dry_run,
                        )
                        remember_status(status_payload)
                        summary["closed_finalized"].append(f"{period_month.isoformat()}:{market}")
                        logger.info("Finalized %s for %s with %d rows", period_month, market, len(records))
                    else:
                        status_payload = upsert_period_status(
                            client,
                            region=market,
                            period_month=period_month,
                            period_status="provider_not_ready",
                            provider_ready=False,
                            row_count=len(records),
                            keyword_count=keyword_count,
                            error_message="Provider did not return enough finalized keyword coverage.",
                            dry_run=dry_run,
                        )
                        remember_status(status_payload)
                        summary["provider_not_ready"].append(f"{period_month.isoformat()}:{market}")
                        logger.warning("Provider not ready for %s %s: %d/%d keywords", market, period_month, keyword_count, len(keyword_lookup))
                except Exception as e:
                    status_payload = upsert_period_status(
                        client,
                        region=market,
                        period_month=period_month,
                        period_status="failed",
                        provider_ready=False,
                        row_count=0,
                        keyword_count=0,
                        error_message=str(e),
                        dry_run=dry_run,
                    )
                    remember_status(status_payload)
                    summary["failed"].append(f"{period_month.isoformat()}:{market}")
                    logger.warning("Failed finalizing %s %s: %s", period_month, market, e)

        closed_global_statuses.append(upsert_global_period_status(
            client,
            period_month=period_month,
            current_month=current_month,
            dry_run=dry_run,
            status_rows=period_status_rows if dry_run else None,
        ))

    for market in MARKETS:
        current_state = existing_period_state(client, market, current_month)
        if partial_period_is_fresh(current_state):
            logger.info("Current partial period is fresh for %s %s; skipping", market, current_month)
            continue

        try:
            df = fetch_period_dataframe(pytrends, keywords, current_month, as_of, market, complete=False)
            records = build_period_records(keyword_lookup, df, current_month, market, complete=False)
            save_records(client, records, dry_run)
            status_payload = upsert_period_status(
                client,
                region=market,
                period_month=current_month,
                period_status="partial",
                provider_ready=bool(records),
                row_count=len(records),
                keyword_count=len({record["keyword_id"] for record in records}),
                dry_run=dry_run,
            )
            remember_status(status_payload)
            summary["current_partial"].append(market)
            logger.info("Stored partial %s for %s with %d rows", current_month, market, len(records))
        except Exception as e:
            status_payload = upsert_period_status(
                client,
                region=market,
                period_month=current_month,
                period_status="failed",
                provider_ready=False,
                row_count=0,
                keyword_count=0,
                error_message=str(e),
                dry_run=dry_run,
            )
            remember_status(status_payload)
            summary["failed"].append(market)
            logger.warning("Failed partial collection %s %s: %s", market, current_month, e)

    upsert_global_period_status(client, period_month=current_month, current_month=current_month, dry_run=dry_run, status_rows=period_status_rows if dry_run else None)
    logger.info("Rollover summary: %s", summary)
    incomplete_closed = [
        payload for payload in closed_global_statuses
        if payload and not payload.get("is_materially_complete")
    ]
    if fail_on_incomplete and incomplete_closed:
        logger.error(
            "Closed periods remain incomplete: %s",
            [
                {
                    "period_month": payload.get("period_month"),
                    "missing_regions": payload.get("missing_regions", []),
                }
                for payload in incomplete_closed
            ],
        )
        return 2
    return 0

def stitch_chunks(chunks_data):
    chunks_data = [c for c in chunks_data if not c.empty]
    if not chunks_data:
        return pd.DataFrame()
    if len(chunks_data) == 1:
        return chunks_data[0]

    result = chunks_data[-1].copy()
    for i in range(len(chunks_data) - 2, -1, -1):
        older = chunks_data[i]
        overlap_start = result.index.min()
        overlap_end = older.index.max()
        if overlap_start > overlap_end:
            result = pd.concat([older, result])
            continue
        overlap_newer = result[result.index <= overlap_end]
        overlap_older = older[older.index >= overlap_start]
        if overlap_newer.empty or overlap_older.empty:
            result = pd.concat([older[older.index < overlap_start], result])
            continue
        for col in result.columns:
            if col not in older.columns:
                continue
            newer_mean = overlap_newer[col].mean()
            older_mean = overlap_older[col].mean()
            if older_mean > 0 and newer_mean > 0:
                older[col] = older[col] * (newer_mean / older_mean)
        non_overlap = older[older.index < overlap_start]
        result = pd.concat([non_overlap, result]).sort_index()
    return result

def main():
    args = parse_args()
    as_of = datetime.strptime(args.as_of, "%Y-%m-%d").date() if args.as_of else date.today()
    client = get_supabase()

    if args.rollover:
        return run_rollover(client, as_of=as_of, dry_run=args.dry_run, fail_on_incomplete=args.fail_on_incomplete)

    from pytrends.request import TrendReq

    keywords_data = client.table("trend_keywords").select("id, keyword").execute().data or []
    if not keywords_data:
        logger.error("No keywords found")
        return

    keyword_lookup = {row["keyword"]: row["id"] for row in keywords_data}
    
    # Filter to only keywords missing historical data
    existing = client.table("historical_trend_data").select("keyword_id").limit(5000).execute().data or []
    existing_ids = set(row["keyword_id"] for row in existing)
    keywords_data = [k for k in keywords_data if k["id"] not in existing_ids]
    keywords = [row["keyword"] for row in keywords_data]

    if not keywords:
        logger.info("All keywords already have historical data. Nothing to do.")
        return

    logger.info("Keywords: %s", keywords)

    pytrends = TrendReq(hl="en-US", tz=330, timeout=(10, 30), retries=3, backoff_factor=1.0)

    for market in MARKETS:
        logger.info("=== Processing market: %s ===", market)
        all_stitched = {}

        for i in range(0, len(keywords), 5):
            batch = keywords[i:i + 5]
            logger.info("  Batch: %s", batch)

            chunk_dfs = []
            for start, end in CHUNKS:
                logger.info("    Chunk %s to %s ...", start, end)
                df = fetch_chunk(pytrends, batch, start, end, geo=market)
                chunk_dfs.append(df)
                time.sleep(12)

            stitched = stitch_chunks(chunk_dfs)
            if stitched.empty:
                logger.warning("  No data for batch in %s", market)
                continue

            stitched = stitched.resample("MS").mean()
            for kw in batch:
                if kw in stitched.columns:
                    all_stitched[kw] = stitched[kw]
                    logger.info("  Got %d points for '%s' in %s",
                                stitched[kw].notna().sum(), kw, market)

            logger.info("  Sleeping 30s before next batch...")
            time.sleep(30)

        # Save this market's data
        records = []
        for keyword, series in all_stitched.items():
            kw_id = keyword_lookup.get(keyword)
            if not kw_id:
                continue
            for month_ts, score in series.items():
                if pd.isna(score):
                    continue
                records.append({
                    "keyword_id": kw_id,
                    "month": month_ts.date().isoformat(),
                    "google_score": round(float(score), 2),
                    "market": market,
                })

        if records:
            for j in range(0, len(records), 500):
                client.table("historical_trend_data").upsert(
                    records[j:j + 500],
                    on_conflict="keyword_id,month,market"
                ).execute()
            logger.info("Saved %d records for market %s", len(records), market)
        else:
            logger.warning("No records saved for market %s", market)

        logger.info("Sleeping 60s before next market...")
        time.sleep(60)

    logger.info("=== All markets done ===")

if __name__ == "__main__":
    raise SystemExit(main() or 0)
