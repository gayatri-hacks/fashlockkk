from __future__ import annotations
import os, time, logging
from pathlib import Path
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("global-trends")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

MARKETS = ['IT', 'FR', 'US', 'KR', 'JP', 'GB', 'DE', 'AU', 'BR', 'IN', 'SG', 'AE']

CHUNKS = [
    ("2004-01-01", "2008-12-31"),
    ("2008-07-01", "2013-12-31"),
    ("2013-07-01", "2018-12-31"),
    ("2018-07-01", "2023-12-31"),
    ("2023-07-01", "2026-05-01"),
]

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
    from pytrends.request import TrendReq

    client = get_supabase()
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
    main()
