from __future__ import annotations

import logging
import os
import re
import time
from datetime import timedelta
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("trend-engine")
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent


def load_environment() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def get_supabase():
    load_environment()
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase environment variables are missing.")
    return create_client(supabase_url, supabase_key)


def fetch_table(client, table_name: str):
    result = client.table(table_name).select("*").execute()
    return result.data or []


def keyword_count(title: str, keyword: str) -> int:
    return 1 if normalize(keyword) in normalize(title) else 0


# ── Signal 1: Google Trends ───────────────────────────────────────────────────

def fetch_google_trends(keywords: list[str], geo: str = "IN") -> dict[str, float]:
    try:
        from pytrends.request import TrendReq
    except ImportError:
        logger.warning("pytrends not installed — skipping Google Trends signal.")
        return {kw: 50.0 for kw in keywords}

    scores: dict[str, float] = {}
    pytrends = TrendReq(hl="en-US", tz=330, timeout=(10, 25), retries=2, backoff_factor=0.5)
    batch_size = 5

    for i in range(0, len(keywords), batch_size):
        batch = keywords[i : i + batch_size]
        try:
            pytrends.build_payload(batch, cat=0, timeframe="today 3-m", geo=geo, gprop="")
            data = pytrends.interest_over_time()
            if data.empty:
                for kw in batch:
                    scores[kw] = 0.0
            else:
                for kw in batch:
                    scores[kw] = round(float(data[kw].mean()), 2) if kw in data.columns else 0.0
            logger.info("Google Trends batch %d/%d done: %s",
                        i // batch_size + 1, -(-len(keywords) // batch_size), batch)
            time.sleep(15.0)
        except Exception as e:
            logger.warning("Google Trends failed for batch %s: %s — fallback 50.0", batch, e)
            for kw in batch:
                scores.setdefault(kw, 50.0)
            time.sleep(30.0)

    return scores


# ── Signal 2: YouTube Trends ──────────────────────────────────────────────────

def fetch_youtube_trends(keywords: list[str], geo: str = "IN") -> dict[str, float]:
    try:
        from pytrends.request import TrendReq
    except ImportError:
        return {kw: 0.0 for kw in keywords}

    scores: dict[str, float] = {}
    pytrends = TrendReq(hl="en-US", tz=330, timeout=(10, 25), retries=2, backoff_factor=0.5)
    batch_size = 5

    for i in range(0, len(keywords), batch_size):
        batch = keywords[i : i + batch_size]
        try:
            pytrends.build_payload(batch, cat=0, timeframe="today 3-m", geo=geo, gprop="youtube")
            data = pytrends.interest_over_time()
            if data.empty:
                for kw in batch:
                    scores[kw] = 0.0
            else:
                for kw in batch:
                    scores[kw] = round(float(data[kw].mean()), 2) if kw in data.columns else 0.0
            logger.info("YouTube Trends batch %d/%d done: %s",
                        i // batch_size + 1, -(-len(keywords) // batch_size), batch)
            time.sleep(20.0)
        except Exception as e:
            logger.warning("YouTube Trends failed for batch %s: %s — fallback 0.0", batch, e)
            for kw in batch:
                scores.setdefault(kw, 0.0)
            time.sleep(30.0)

    return scores


# ── Signal 3: Reddit India mentions ──────────────────────────────────────────

def fetch_reddit_signals(keywords: list[str]) -> dict[str, float]:
    """
    Fetch mention counts from Indian fashion subreddits.
    Uses Reddit's public JSON API — no auth needed.
    """
    SUBREDDITS = ["IndianFashionAddicts", "streetwear", "indiashopping", "india"]
    scores = {kw: 0.0 for kw in keywords}

    headers = {
        "User-Agent": "fashiontrend-bot/1.0 (trend research tool)"
    }

    for subreddit in SUBREDDITS:
        try:
            url = f"https://www.reddit.com/r/{subreddit}/search.json?sort=new&limit=100&t=month&restrict_sr=1&q=fashion"
            resp = __import__("requests").get(url, headers=headers, timeout=15)
            if resp.status_code != 200:
                logger.warning("Reddit %s returned %s", subreddit, resp.status_code)
                continue

            posts = resp.json().get("data", {}).get("children", [])
            text_corpus = " ".join([
                (p["data"].get("title", "") + " " + p["data"].get("selftext", "")).lower()
                for p in posts
            ])

            for kw in keywords:
                count = text_corpus.count(normalize(kw))
                scores[kw] += count

            logger.info("Reddit r/%s: scraped %d posts", subreddit, len(posts))
            time.sleep(15.0)

        except Exception as e:
            logger.warning("Reddit r/%s failed: %s", subreddit, e)
            time.sleep(20.0)

    # Normalize to 0-100
    max_score = max(scores.values()) if scores and max(scores.values()) > 0 else 1.0
    return {kw: round((v / max_score) * 100, 2) for kw, v in scores.items()}


# ── Signal 4: Discount & New Arrival signals from product DB ─────────────────

def calculate_product_signals(
    products_df: pd.DataFrame,
    keywords: list[str],
) -> dict[str, dict]:
    """
    For each keyword calculate:
    - avg_discount: average discount % on matching products (high = clearing dead stock = bad)
    - new_arrival_ratio: % of matching products added in last 7 days (high = brand betting on it = good)
    """
    signals = {}
    now = pd.Timestamp.now(tz="UTC")
    week_ago = now - pd.Timedelta(days=7)

    df = products_df.copy()
    df["scraped_at"] = pd.to_datetime(df["scraped_at"], utc=True, errors="coerce")

    for kw in keywords:
        mask = df["title"].fillna("").str.lower().str.contains(normalize(kw), regex=False)
        kw_df = df[mask]

        if kw_df.empty:
            signals[kw] = {"avg_discount": 0.0, "new_arrival_score": 0.0}
            continue

        # Discount signal — high discount = brand clearing stock = negative signal
        discounts = kw_df["discount_percentage"].dropna()
        avg_discount = float(discounts.mean()) if not discounts.empty else 0.0

        # New arrival signal — products scraped in last 7 days
        recent = kw_df[kw_df["scraped_at"] >= week_ago]
        new_arrival_ratio = len(recent) / len(kw_df) if len(kw_df) > 0 else 0.0
        new_arrival_score = new_arrival_ratio * 100

        signals[kw] = {
            "avg_discount": round(avg_discount, 2),
            "new_arrival_score": round(new_arrival_score, 2),
        }

    return signals


# ── Main trend calculation ────────────────────────────────────────────────────

def calculate_snapshots(
    products_df: pd.DataFrame,
    keywords_df: pd.DataFrame,
    google_scores: dict[str, float],
    youtube_scores: dict[str, float],
    reddit_scores: dict[str, float],
    product_signals: dict[str, dict],
) -> list[dict]:
    if products_df.empty or keywords_df.empty:
        return []

    df = products_df.copy()
    df["scraped_at"] = pd.to_datetime(df["scraped_at"], utc=True, errors="coerce")
    df = df.dropna(subset=["scraped_at"])
    if df.empty:
        return []

    df["week_start"] = df["scraped_at"].dt.to_period("W-MON").apply(
        lambda period: period.start_time.date()
    )

    records: list[dict] = []
    grouped_weeks = sorted(df["week_start"].dropna().unique())
    keyword_lookup = {row["keyword"]: row["id"] for _, row in keywords_df.iterrows()}

    # Normalize all scores to 0-100
    def norm(d: dict[str, float]) -> dict[str, float]:
        mx = max(d.values()) if d and max(d.values()) > 0 else 1.0
        return {k: round((v / mx) * 100, 2) for k, v in d.items()}

    g_norm  = norm(google_scores)
    yt_norm = norm(youtube_scores)
    # reddit already normalized

    for source_id in sorted(df["source_id"].dropna().unique()):
        source_df = df[df["source_id"] == source_id]
        for category_id in sorted(source_df["category_id"].dropna().unique()):
            group_df = source_df[source_df["category_id"] == category_id]
            total_products = len(group_df)

            for current_week in grouped_weeks:
                current_week_df = group_df[group_df["week_start"] == current_week]
                previous_week   = current_week - timedelta(days=7)
                previous_week_df = group_df[group_df["week_start"] == previous_week]

                for keyword, kw_id in keyword_lookup.items():
                    current_series = (
                        current_week_df["title"].fillna("").astype(str)
                        .map(lambda t, kw=keyword: keyword_count(t, kw))
                    )
                    previous_series = (
                        previous_week_df["title"].fillna("").astype(str)
                        .map(lambda t, kw=keyword: keyword_count(t, kw))
                    )
                    current_count  = int(current_series.sum()) if not current_series.empty else 0
                    previous_count = int(previous_series.sum()) if not previous_series.empty else 0

                    # Flipkart/brand inventory signal
                    if previous_count > 0:
                        flipkart_growth = ((current_count - previous_count) / previous_count) * 100
                    elif current_count > 0:
                        share = (current_count / total_products) * 100 if total_products > 0 else 0
                        flipkart_growth = min(share * 2, 100)
                    else:
                        flipkart_growth = 0.0

                    # Get all signals
                    g   = g_norm.get(keyword, 50.0)
                    yt  = yt_norm.get(keyword, 0.0)
                    rd  = reddit_scores.get(keyword, 0.0)
                    ps  = product_signals.get(keyword, {})

                    # New arrival bonus (0-20 points)
                    new_arrival_bonus = ps.get("new_arrival_score", 0.0) * 0.2

                    # Discount penalty (high discount = negative signal, up to -15 points)
                    discount_penalty = min(ps.get("avg_discount", 0.0) * 0.3, 15.0)

                    # ── Combined score ────────────────────────────────────
                    # Weights: Google 30%, YouTube 20%, Brand inventory 25%,
                    #          Reddit 10%, New arrival 10%, Discount penalty -5%
                    combined = (
                        (g  * 0.30) +
                        (yt * 0.20) +
                        (flipkart_growth * 0.25) +
                        (rd * 0.10) +
                        new_arrival_bonus -
                        discount_penalty
                    )
                    combined = max(0.0, round(combined, 2))

                    status = (
                        "Rising"    if combined > 55 else
                        "Declining" if combined < 35 else
                        "Stable"
                    )

                    records.append({
                        "keyword_id":        kw_id,
                        "source_id":         int(source_id),
                        "category_id":       int(category_id),
                        "product_count":     current_count,
                        "snapshot_date":     current_week.isoformat(),
                        "previous_count":    previous_count,
                        "growth_percentage": round(flipkart_growth, 2),  # actual WoW growth
                        "blended_score":     combined,                    # the real composite score
                        "google_score":      round(g, 2),
                        "youtube_score":     round(yt, 2),
                        "reddit_score":      round(rd, 2),
                        "flipkart_growth":   round(flipkart_growth, 2),
                        "status":            status,
                    })

    return records




def main() -> int:
    client   = get_supabase()
    products = fetch_table(client, "products")
    keywords = fetch_table(client, "trend_keywords")

    if not products or not keywords:
        logger.info("No products or keywords found.")
        return 0

    products_df = pd.DataFrame(products)
    keywords_df = pd.DataFrame(keywords)
    keyword_list = [row["keyword"] for row in keywords]

    # ── Fetch all signals ─────────────────────────────────────────
    logger.info("Fetching Google Trends...")
    google_scores = fetch_google_trends(keyword_list, geo="IN")

    logger.info("Fetching YouTube Trends...")
    youtube_scores = fetch_youtube_trends(keyword_list, geo="IN")

    logger.info("Fetching Reddit signals...")
    reddit_scores = fetch_reddit_signals(keyword_list)

    logger.info("Calculating product signals (discount + new arrivals)...")
    product_signals = calculate_product_signals(products_df, keyword_list)

    # Log sample
    logger.info("Google sample:  %s", dict(list(google_scores.items())[:3]))
    logger.info("YouTube sample: %s", dict(list(youtube_scores.items())[:3]))
    logger.info("Reddit sample:  %s", dict(list(reddit_scores.items())[:3]))
    logger.info("Product signals sample: %s", dict(list(product_signals.items())[:3]))

    # ── Calculate and save ────────────────────────────────────────
    snapshots = calculate_snapshots(
        products_df, keywords_df,
        google_scores, youtube_scores, reddit_scores, product_signals
    )

    # Upsert only — never delete history
    if snapshots:
        client.table("trend_snapshots").upsert(
            snapshots,
            on_conflict="keyword_id,source_id,category_id,snapshot_date"
        ).execute()
        logger.info("Upserted %d trend snapshots.", len(snapshots))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
