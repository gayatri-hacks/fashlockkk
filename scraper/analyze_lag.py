from __future__ import annotations
import os, logging
from pathlib import Path
import pandas as pd
import numpy as np
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("lag-analysis")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

# Reference market — we measure lag relative to India
REFERENCE_MARKET = "IN"

# Origin markets we expect to lead
ORIGIN_MARKETS = ["IT", "FR", "US", "KR", "JP"]
ALL_MARKETS = ["IT", "FR", "US", "KR", "JP", "GB", "DE", "AU", "BR", "IN", "SG", "AE"]

def get_supabase():
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key)

def fetch_data(client):
    logger.info("Fetching historical trend data...")
    all_data = []
    offset = 0
    while True:
        result = client.table("historical_trend_data")\
            .select("keyword_id, market, month, google_score")\
            .range(offset, offset + 999)\
            .execute()
        batch = result.data or []
        if not batch:
            break
        all_data.extend(batch)
        offset += 1000
        if len(batch) < 1000:
            break
    logger.info("Fetched %d records", len(all_data))
    return pd.DataFrame(all_data)

def fetch_keywords(client):
    result = client.table("trend_keywords").select("id, keyword, category").execute()
    return {row["id"]: row for row in (result.data or [])}

def compute_lag(series_origin: pd.Series, series_target: pd.Series, max_lag_months: int = 36) -> dict:
    """
    Cross-correlate two time series to find the lag where correlation is highest.
    Positive lag = origin leads target (origin peaked before target).
    """
    # Align on common dates
    combined = pd.DataFrame({"origin": series_origin, "target": series_target}).dropna()
    if len(combined) < 24:
        return {"lag_months": None, "correlation": None, "confidence": "low"}

    origin = combined["origin"].values
    target = combined["target"].values

    # Normalize
    origin = (origin - origin.mean()) / (origin.std() + 1e-8)
    target = (target - target.mean()) / (target.std() + 1e-8)

    best_corr = -1
    best_lag = 0

    for lag in range(0, max_lag_months + 1):
        if lag == 0:
            corr = np.corrcoef(origin, target)[0, 1]
        else:
            if len(origin) <= lag:
                break
            corr = np.corrcoef(origin[:-lag], target[lag:])[0, 1]
        if corr > best_corr:
            best_corr = corr
            best_lag = lag

    confidence = "high" if best_corr > 0.6 else "medium" if best_corr > 0.4 else "low"

    return {
        "lag_months": best_lag,
        "correlation": round(float(best_corr), 3),
        "confidence": confidence
    }

def main():
    client = get_supabase()
    df = fetch_data(client)
    keywords = fetch_keywords(client)

    if df.empty:
        logger.error("No data found")
        return

    df["month"] = pd.to_datetime(df["month"])
    df["keyword_id"] = df["keyword_id"].astype(int)

    results = []

    for kw_id, kw_info in keywords.items():
        keyword = kw_info["keyword"]
        kw_df = df[df["keyword_id"] == kw_id]

        if kw_df.empty:
            continue

        # Get India series
        india_df = kw_df[kw_df["market"] == REFERENCE_MARKET].set_index("month")["google_score"]
        if india_df.empty:
            continue

        for market in ALL_MARKETS:
            if market == REFERENCE_MARKET:
                continue

            market_df = kw_df[kw_df["market"] == market].set_index("month")["google_score"]
            if market_df.empty:
                continue

            lag_result = compute_lag(market_df, india_df)

            results.append({
                "keyword": keyword,
                "category": kw_info.get("category", ""),
                "market": market,
                "lag_months": lag_result["lag_months"],
                "correlation": lag_result["correlation"],
                "confidence": lag_result["confidence"],
            })

        logger.info("Processed: %s", keyword)

    results_df = pd.DataFrame(results)

    # Print summary
    print("\n" + "="*70)
    print("LAG ANALYSIS — How many months each market leads India")
    print("="*70)

    high_conf = results_df[results_df["confidence"] == "high"]

    if not high_conf.empty:
        summary = high_conf.groupby("market").agg(
            avg_lag=("lag_months", "mean"),
            avg_correlation=("correlation", "mean"),
            keyword_count=("keyword", "count")
        ).round(1).sort_values("avg_lag", ascending=False)

        print("\nMarket lag overview (high confidence only):")
        print(summary.to_string())

        print("\n\nTop leading indicators per keyword:")
        for keyword in high_conf["keyword"].unique():
            kw_data = high_conf[high_conf["keyword"] == keyword]\
                .sort_values("lag_months", ascending=False)\
                .head(3)
            if not kw_data.empty:
                top = kw_data.iloc[0]
                print(f"  {keyword:25s} — {top['market']} leads by {top['lag_months']:2d} months "
                      f"(corr: {top['correlation']:.2f})")

    # Save full results
    output_path = PROJECT_ROOT / "scraper" / "lag_analysis_results.csv"
    results_df.to_csv(output_path, index=False)
    logger.info("Full results saved to %s", output_path)

    # Save to Supabase for use in the app
    logger.info("Saving lag results to Supabase...")
    
    # Create table first if needed — run this SQL in Supabase:
    # create table if not exists market_lag_analysis (
    #   id bigint generated by default as identity primary key,
    #   keyword text not null,
    #   market text not null,
    #   lag_months integer,
    #   correlation numeric,
    #   confidence text,
    #   computed_at timestamptz not null default now(),
    #   constraint market_lag_unique unique (keyword, market)
    # );

    records = results_df[results_df["lag_months"].notna()].to_dict("records")
    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            client.table("market_lag_analysis").upsert(
                batch, on_conflict="keyword,market"
            ).execute()
        except Exception as e:
            logger.warning("Could not save to Supabase (table may not exist yet): %s", e)

    logger.info("Done. %d lag relationships computed.", len(results))

if __name__ == "__main__":
    main()
