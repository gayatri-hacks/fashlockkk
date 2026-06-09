from __future__ import annotations
import os, time, logging, requests
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("global-shopify")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

SOURCES = [
    {"id": 25, "name": "Revolve",          "base_url": "https://www.revolve.com",         "market": "US"},
    {"id": 26, "name": "Urban Outfitters", "base_url": "https://www.urbanoutfitters.com",  "market": "US"},
    {"id": 27, "name": "Yesstyle",         "base_url": "https://www.yesstyle.com",         "market": "KR"},
    {"id": 28, "name": "SSENSE",           "base_url": "https://www.ssense.com",           "market": "CA"},
    {"id": 29, "name": "Free People",      "base_url": "https://www.freepeople.com",       "market": "US"},
    {"id": 30, "name": "Shein",            "base_url": "https://us.shein.com",             "market": "US"},
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

def get_supabase():
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key)

def fetch_shopify_products(base_url: str, max_pages: int = 20):
    """Fetch all products from a Shopify store via products.json"""
    products = []
    page = 1
    last_id = 0

    while page <= max_pages:
        # Use since_id pagination — more reliable than page param
        url = f"{base_url}/products.json?limit=250&since_id={last_id}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
            if resp.status_code == 429:
                logger.warning("Rate limited, sleeping 60s...")
                time.sleep(60)
                continue
            if resp.status_code != 200:
                logger.warning("Got %d from %s", resp.status_code, url)
                break
            data = resp.json()
            batch = data.get("products", [])
            if not batch:
                break
            products.extend(batch)
            last_id = batch[-1]["id"]
            logger.info("  Page %d: fetched %d products (total %d)", page, len(batch), len(products))
            page += 1
            time.sleep(2)
        except Exception as e:
            logger.warning("Error fetching %s: %s", url, e)
            break

    return products

def parse_product(raw: dict, source_id: int, market: str) -> dict | None:
    """Extract relevant fields from a Shopify product"""
    try:
        title = raw.get("title", "").strip()
        if not title:
            return None

        # Get first variant price
        variants = raw.get("variants", [])
        price = None
        if variants:
            try:
                price = float(variants[0].get("price", 0))
            except (ValueError, TypeError):
                price = None

        # Get first image
        images = raw.get("images", [])
        image_url = images[0].get("src") if images else None

        # Tags as list
        tags_raw = raw.get("tags", "")
        tags = [t.strip() for t in tags_raw.split(",")] if tags_raw else []

        # Product type
        product_type = raw.get("product_type", "").strip()

        return {
            "source_id": source_id,
            "external_id": str(raw.get("id", "")),
            "title": title,
            "price": price,
            "image_url": image_url,
            "tags": tags,
            "product_type": product_type,
            "market": market,
            "url": f"/products/{raw.get('handle', '')}",
        }
    except Exception as e:
        logger.warning("Failed to parse product: %s", e)
        return None

def save_products(client, products: list[dict], source_name: str):
    """Upsert products to Supabase in batches"""
    if not products:
        return

    # Check which columns exist in products table
    batch_size = 100
    saved = 0
    errors = 0

    for i in range(0, len(products), batch_size):
        batch = products[i:i + batch_size]
        try:
            client.table("products").upsert(
                batch,
                on_conflict="source_id,external_id"
            ).execute()
            saved += len(batch)
        except Exception as e:
            logger.warning("Batch save error for %s: %s", source_name, e)
            # Try saving minimal fields if full save fails
            try:
                minimal = [{
                    "source_id": p["source_id"],
                    "external_id": p["external_id"],
                    "title": p["title"],
                    "price": p["price"],
                    "image_url": p["image_url"],
                } for p in batch]
                client.table("products").upsert(
                    minimal,
                    on_conflict="source_id,external_id"
                ).execute()
                saved += len(batch)
            except Exception as e2:
                logger.error("Minimal save also failed: %s", e2)
                errors += len(batch)

    logger.info("Saved %d products for %s (%d errors)", saved, source_name, errors)

def main():
    client = get_supabase()

    for source in SOURCES:
        logger.info("=== Scraping %s (ID %d, market %s) ===",
                    source["name"], source["id"], source["market"])

        raw_products = fetch_shopify_products(source["base_url"])
        logger.info("Fetched %d raw products from %s", len(raw_products), source["name"])

        if not raw_products:
            logger.warning("No products found for %s — may be bot-protected", source["name"])
            continue

        parsed = []
        for raw in raw_products:
            product = parse_product(raw, source["id"], source["market"])
            if product:
                parsed.append(product)

        logger.info("Parsed %d valid products for %s", len(parsed), source["name"])
        save_products(client, parsed, source["name"])

        logger.info("Sleeping 30s before next source...")
        time.sleep(30)

    logger.info("=== All sources done ===")

    # Final count
    result = client.table("products").select("source_id", count="exact").in_(
        "source_id", [s["id"] for s in SOURCES]
    ).execute()
    logger.info("Total global products in DB: %d", result.count or 0)

if __name__ == "__main__":
    main()
