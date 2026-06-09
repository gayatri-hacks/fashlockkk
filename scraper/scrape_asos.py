from __future__ import annotations
import os, time, logging
from pathlib import Path
import requests
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("asos-scraper")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

BASE_URL = "https://www.asos.com/api/product/search/v2/categories/{cid}"
PARAMS_BASE = {
    "channel": "desktop-web",
    "lang": "en-GB",
    "store": "COM",
    "country": "GB",
    "currency": "GBP",
    "limit": 72,
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.asos.com/",
}

# (category_id, gender, category_name)
# Known clothing categories — non-clothing filtered by name check in parse
CATEGORIES = [
    (2638, "women", "Dresses"),
    (4169, "women", "Tops"),
    (2642, "women", "Jeans"),
    (2641, "women", "Coats & Jackets"),
    (2637, "women", "Skirts"),
    (2631, "women", "Jumpers & Cardigans"),
    (2630, "women", "Co-ords"),
    (2634, "women", "Trousers & Leggings"),
    (4209, "men",   "T-Shirts & Vests"),
    (4208, "men",   "Shirts"),
    (4207, "men",   "Hoodies & Sweatshirts"),
    (4206, "men",   "Jeans"),
    (4205, "men",   "Trousers"),
    (4204, "men",   "Jackets & Coats"),
    (4203, "men",   "Joggers & Tracksuits"),
    (2623, "women", "New In Clothing"),
    (6993, "men",   "New In Clothing"),
]

def get_supabase():
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key)

def get_or_create_source(client):
    result = client.table("sources").select("id").eq("name", "ASOS").execute()
    if result.data:
        return result.data[0]["id"]
    result = client.table("sources").upsert({
        "name": "ASOS",
        "base_url": "https://www.asos.com",
        "source_type": "custom",
        "gender": "unisex",
        "category": "global",
        "is_active": True,
    }, on_conflict="name").execute()
    return result.data[0]["id"]

def get_or_create_category(client, name):
    result = client.table("categories").select("id").eq("name", name).execute()
    if result.data:
        return result.data[0]["id"]
    result = client.table("categories").insert({"name": name}).execute()
    return result.data[0]["id"]

def scrape_category(cid, max_pages=10):
    products = []
    offset = 0
    for page in range(max_pages):
        params = {**PARAMS_BASE, "offset": offset}
        try:
            resp = requests.get(
                BASE_URL.format(cid=cid),
                params=params,
                headers=HEADERS,
                timeout=20,
            )
            if resp.status_code == 429:
                logger.warning("Rate limited on cid=%d, sleeping 60s", cid)
                time.sleep(60)
                continue
            if resp.status_code != 200:
                logger.warning("Status %d for cid=%d offset=%d", resp.status_code, cid, offset)
                break
            data = resp.json()
            batch = data.get("products", [])
            if not batch:
                break
            products.extend(batch)
            total = data.get("itemCount", 0)
            logger.info("  cid=%d page=%d offset=%d fetched=%d total=%d",
                       cid, page+1, offset, len(batch), total)
            offset += len(batch)
            if offset >= min(total, max_pages * 72):
                break
            time.sleep(1.5)
        except Exception as e:
            logger.error("Error cid=%d offset=%d: %s", cid, offset, e)
            break
    return products

def parse_product(raw, source_id, category_id, gender):
    try:
        price_obj = raw.get("price", {})
        current = price_obj.get("current", {})
        previous = price_obj.get("previous", {})
        price = current.get("value")
        original = previous.get("value") or price
        discount = round(((original - price) / original) * 100, 1) if original and price and original > price else 0

        url_key = raw.get("url", "")
        product_url = f"https://www.asos.com/{url_key}" if url_key and not url_key.startswith("http") else url_key

        image_url = raw.get("imageUrl", "")
        if image_url and not image_url.startswith("http"):
            image_url = "https://" + image_url

        return {
            "source_id": source_id,
            "category_id": category_id,
            "title": raw.get("name", ""),
            "brand": raw.get("brandName", "ASOS"),
            "price": float(price) if price else None,
            "original_price": float(original) if original else None,
            "discount_percentage": discount,
            "color": raw.get("colour", ""),
            "image_url": image_url,
            "product_url": product_url,
            "gender": gender,
            "tags": [],
        }
    except Exception as e:
        logger.warning("Parse error: %s", e)
        return None

def main():
    client = get_supabase()
    source_id = get_or_create_source(client)
    logger.info("ASOS source_id: %d", source_id)

    total_saved = 0

    for cid, gender, cat_name in CATEGORIES:
        logger.info("=== Scraping cid=%d (%s / %s) ===", cid, gender, cat_name)
        category_id = get_or_create_category(client, cat_name)

        raw = scrape_category(cid, max_pages=15)
        logger.info("Fetched %d raw products", len(raw))

        parsed = [p for p in
                  [parse_product(r, source_id, category_id, gender) for r in raw]
                  if p and p.get("product_url")]

        for i in range(0, len(parsed), 100):
            batch = parsed[i:i+100]
            try:
                client.table("products").upsert(batch, on_conflict="product_url").execute()
                total_saved += len(batch)
            except Exception as e:
                logger.error("Upsert failed: %s", e)

        logger.info("Saved %d products for cid=%d", len(parsed), cid)
        time.sleep(3)

    logger.info("=== Done. Total saved: %d ===", total_saved)

if __name__ == "__main__":
    main()
