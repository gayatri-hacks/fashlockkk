"""
Instagram hashtag signal scraper.
Fetches public post counts for fashion keywords from Instagram.
No API key needed — uses public web endpoint.
Saves scores to Supabase table: instagram_signals
"""
from __future__ import annotations
import logging
import os
import time
import re
import json
import random
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("instagram-scraper")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

# Fashion keywords mapped to Instagram hashtags (India-specific)
KEYWORD_HASHTAGS = {
    "oversized":    ["oversizedtshirt", "oversizedfashion", "oversizedootd"],
    "baggy":        ["baggyjeans", "baggyfashion", "baggypants"],
    "cargo":        ["cargopants", "cargotrousers", "cargostyle"],
    "denim":        ["denimstyle", "denimfashion", "denimlook"],
    "linen":        ["linenshirt", "linenfashion", "linenootd"],
    "washed":       ["washedtshirt", "acidwash", "washedfabric"],
    "vintage":      ["vintagefashion", "vintagestyle", "vintageootd"],
    "graphic":      ["graphictee", "graphicshirt", "graphicfashion"],
    "cropped":      ["croptop", "croppedhoodie", "croppedshirt"],
    "varsity":      ["varsityjacket", "varsitystyle", "varsityvibes"],
    "utility":      ["utilitywear", "utilityfashion", "utilityoutfit"],
    "minimal":      ["minimalfashion", "minimalstyle", "minimalistoutfit"],
    "co-ord":       ["coordset", "coordsets", "matchingset"],
    "streetwear":   ["streetwearindia", "indianstreetwear", "streetstyleindia"],
    "relaxed fit":  ["relaxedfit", "relaxedfashion", "relaxedstyle"],
    "wide leg":     ["widelegpants", "widelegjeans", "widelegtrousers"],
    "slim fit":     ["slimfit", "slimfitjeans", "slimfitshirt"],
    "floral":       ["floraldress", "floralprint", "florallook"],
    "knit":         ["knitwear", "knittop", "knitstyle"],
    "mesh":         ["meshtop", "meshfashion", "meshoutfit"],
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}


def load_environment() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)


def get_supabase():
    load_environment()
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("Supabase environment variables missing.")
    return create_client(url, key)


def fetch_hashtag_count(hashtag: str) -> int | None:
    """Fetch post count for a hashtag from Instagram's public page."""
    url = f"https://www.instagram.com/explore/tags/{hashtag}/"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            logger.warning("HTTP %s for #%s", resp.status_code, hashtag)
            return None

        # Try to find post count in the page source
        text = resp.text

        # Pattern 1: JSON data in script tags
        match = re.search(r'"edge_hashtag_to_media":\{"count":(\d+)', text)
        if match:
            return int(match.group(1))

        # Pattern 2: meta description
        match = re.search(r'([\d,]+)\s+posts', text)
        if match:
            return int(match.group(1).replace(",", ""))

        # Pattern 3: __additionalData
        match = re.search(r'"media_count":(\d+)', text)
        if match:
            return int(match.group(1))

        logger.warning("Could not parse count for #%s", hashtag)
        return None

    except Exception as e:
        logger.warning("Failed to fetch #%s: %s", hashtag, e)
        return None


def get_keyword_score(keyword: str, hashtags: list[str]) -> dict:
    """Get aggregate post count for a keyword across its hashtags."""
    total = 0
    fetched = 0
    for tag in hashtags:
        count = fetch_hashtag_count(tag)
        if count is not None:
            total += count
            fetched += 1
        time.sleep(random.uniform(2.0, 4.0))  # polite delay

    return {
        "keyword": keyword,
        "total_posts": total,
        "hashtags_fetched": fetched,
        "hashtags_tried": len(hashtags),
    }


def ensure_instagram_table(client) -> None:
    """Create instagram_signals table if it doesn't exist via upsert."""
    pass  # Supabase will error clearly if table missing


def save_signals(client, signals: list[dict]) -> None:
    scraped_at = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "keyword": s["keyword"],
            "total_posts": s["total_posts"],
            "hashtags_fetched": s["hashtags_fetched"],
            "scraped_at": scraped_at,
        }
        for s in signals
    ]
    try:
        client.table("instagram_signals").insert(rows).execute()
        logger.info("Saved %d Instagram signals", len(rows))
    except Exception as e:
        logger.error("Failed to save signals: %s", e)
        # Fall back to printing so the data isn't lost
        logger.info("Signal data: %s", json.dumps(rows, indent=2))


def main() -> None:
    client = get_supabase()
    signals = []

    logger.info("Fetching Instagram hashtag counts for %d keywords...", len(KEYWORD_HASHTAGS))
    for keyword, hashtags in KEYWORD_HASHTAGS.items():
        logger.info("Processing: %s -> %s", keyword, hashtags)
        result = get_keyword_score(keyword, hashtags)
        signals.append(result)
        logger.info("  %s: %d posts across %d hashtags",
                    keyword, result["total_posts"], result["hashtags_fetched"])
        time.sleep(random.uniform(3.0, 6.0))

    # Print summary even if DB save fails
    print("\n=== INSTAGRAM SIGNAL SUMMARY ===")
    for s in sorted(signals, key=lambda x: -x["total_posts"]):
        print(f"  {s['keyword']:<15} {s['total_posts']:>12,} posts")

    save_signals(client, signals)


if __name__ == "__main__":
    main()
