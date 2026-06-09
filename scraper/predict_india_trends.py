from __future__ import annotations
import os, logging
from pathlib import Path
from datetime import date, timedelta
import pandas as pd
import numpy as np
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("predictions")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
REFERENCE_MARKET = "IN"

def get_supabase():
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key)

def fetch_lag_model(client):
    result = client.table("market_lag_analysis")\
        .select("keyword, market, lag_months, correlation, confidence")\
        .eq("confidence", "high")\
        .execute()
    return pd.DataFrame(result.data or [])

def fetch_recent_trends(client):
    """Get the last 6 months of trend data for all origin markets."""
    cutoff = (date.today() - timedelta(days=180)).isoformat()
    all_data = []
    offset = 0
    while True:
        result = client.table("historical_trend_data")\
            .select("keyword_id, market, month, google_score")\
            .gte("month", cutoff)\
            .neq("market", REFERENCE_MARKET)\
            .range(offset, offset + 999)\
            .execute()
        batch = result.data or []
        if not batch:
            break
        all_data.extend(batch)
        offset += 1000
        if len(batch) < 1000:
            break
    return pd.DataFrame(all_data)

def fetch_keywords(client):
    result = client.table("trend_keywords").select("id, keyword, category").execute()
    return pd.DataFrame(result.data or [])

def compute_momentum(series: pd.Series) -> float:
    """How fast is this keyword rising in the last 3 months? +1 = strong rise, -1 = falling."""
    if len(series) < 3:
        return 0.0
    recent = series.iloc[-3:]
    older  = series.iloc[-6:-3] if len(series) >= 6 else series.iloc[:3]
    if older.mean() == 0:
        return 0.0
    return float(np.clip((recent.mean() - older.mean()) / (older.mean() + 1e-8), -1, 2))

def generate_predictions(lag_df, recent_df, keywords_df):
    kw_lookup = keywords_df.set_index("id")[["keyword","category"]].to_dict("index")
    recent_df["month"] = pd.to_datetime(recent_df["month"])
    recent_df["keyword_id"] = recent_df["keyword_id"].astype(int)

    predictions = []

    for kw_id, kw_info in kw_lookup.items():
        keyword = kw_info["keyword"]
        category = kw_info.get("category", "")

        kw_lag = lag_df[lag_df["keyword"] == keyword]
        if kw_lag.empty:
            continue

        kw_recent = recent_df[recent_df["keyword_id"] == kw_id]

        signals = []
        for _, lag_row in kw_lag.iterrows():
            market = lag_row["market"]
            lag_months = lag_row["lag_months"]
            correlation = lag_row["correlation"]

            mkt_data = kw_recent[kw_recent["market"] == market].sort_values("month")
            if mkt_data.empty:
                continue

            current_score = float(mkt_data["google_score"].iloc[-1])
            momentum = compute_momentum(mkt_data.set_index("month")["google_score"])

            # Estimated India score = current origin score decayed by lag
            # (trends lose intensity as they diffuse to adoption markets)
            decay = max(0.4, 1 - (lag_months / 48))
            projected_india_score = current_score * decay

            # Arrival date = today + lag_months
            arrival_date = date.today() + timedelta(days=lag_months * 30.44)

            signals.append({
                "market": market,
                "lag_months": lag_months,
                "correlation": correlation,
                "current_score": current_score,
                "momentum": momentum,
                "projected_india_score": projected_india_score,
                "arrival_date": arrival_date,
            })

        if not signals:
            continue

        signals_df = pd.DataFrame(signals)

        # Weighted average of projected scores (weight = correlation)
        weights = signals_df["correlation"].values
        if weights.sum() == 0:
            continue

        weighted_score = float(np.average(
            signals_df["projected_india_score"].values, weights=weights
        ))
        weighted_arrival = float(np.average(
            signals_df["lag_months"].values, weights=weights
        ))
        avg_momentum = float(signals_df["momentum"].mean())
        best_predictor = signals_df.sort_values("correlation", ascending=False).iloc[0]

        # Confidence = avg correlation × signal count factor
        confidence_score = float(
            signals_df["correlation"].mean() * min(1.0, len(signals) / 4)
        )

        # Status classification
        if weighted_score > 60 and avg_momentum > 0.3:
            status = "emerging_strong"
        elif weighted_score > 40 and avg_momentum > 0:
            status = "emerging"
        elif weighted_score > 60 and avg_momentum < -0.2:
            status = "peaking"
        elif weighted_score < 20:
            status = "dormant"
        else:
            status = "stable"

        predictions.append({
            "keyword": keyword,
            "category": category,
            "projected_india_score": round(weighted_score, 1),
            "estimated_lag_months": round(weighted_arrival, 1),
            "arrival_date": arrival_date.isoformat(),
            "avg_momentum": round(avg_momentum, 3),
            "confidence_score": round(confidence_score, 3),
            "signal_count": len(signals),
            "best_predictor_market": best_predictor["market"],
            "best_predictor_correlation": round(float(best_predictor["correlation"]), 3),
            "status": status,
            "computed_at": date.today().isoformat(),
        })

    return pd.DataFrame(predictions)

def main():
    client = get_supabase()

    logger.info("Fetching lag model...")
    lag_df = fetch_lag_model(client)
    logger.info("Lag model: %d high-confidence relationships", len(lag_df))

    logger.info("Fetching recent trend data (last 6 months)...")
    recent_df = fetch_recent_trends(client)
    logger.info("Recent data: %d records across %s markets",
                len(recent_df), recent_df["market"].nunique() if not recent_df.empty else 0)

    logger.info("Fetching keywords...")
    keywords_df = fetch_keywords(client)

    predictions_df = generate_predictions(lag_df, recent_df, keywords_df)

    if predictions_df.empty:
        logger.warning("No predictions generated — check lag model data")
        return

    predictions_df = predictions_df.sort_values("projected_india_score", ascending=False)

    print("\n" + "="*70)
    print("INDIA TREND PREDICTIONS")
    print("="*70)
    print(predictions_df[[
        "keyword","status","projected_india_score",
        "estimated_lag_months","arrival_date","confidence_score","best_predictor_market"
    ]].to_string(index=False))

    # Create predictions table in Supabase if needed (run this SQL first):
    # create table if not exists trend_predictions (
    #   id bigint generated by default as identity primary key,
    #   keyword text not null,
    #   category text,
    #   projected_india_score numeric,
    #   estimated_lag_months numeric,
    #   arrival_date date,
    #   avg_momentum numeric,
    #   confidence_score numeric,
    #   signal_count integer,
    #   best_predictor_market text,
    #   best_predictor_correlation numeric,
    #   status text,
    #   computed_at date not null default current_date,
    #   constraint trend_predictions_unique unique (keyword, computed_at)
    # );

    records = predictions_df.to_dict("records")
    try:
        client.table("trend_predictions").upsert(
            records, on_conflict="keyword,computed_at"
        ).execute()
        logger.info("Saved %d predictions to Supabase", len(records))
    except Exception as e:
        logger.warning("Could not save to Supabase (create the table first): %s", e)
        predictions_df.to_csv(PROJECT_ROOT / "scraper" / "predictions.csv", index=False)
        logger.info("Saved to predictions.csv instead")

if __name__ == "__main__":
    main()
