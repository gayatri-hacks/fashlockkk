from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("shopify-scraper")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

COLOR_KEYWORDS = {
    # Neutrals
    "black": "Black",
    "white": "White",
    "grey": "Grey",
    "gray": "Grey",
    "beige": "Beige",
    "brown": "Brown",
    "cream": "Cream",
    "ivory": "Ivory",
    "off white": "Off White",
    "off-white": "Off White",
    "ecru": "Cream",
    "sand": "Sand",
    "stone": "Stone",
    "taupe": "Taupe",
    "camel": "Camel",
    "tan": "Tan",
    "charcoal": "Charcoal",
    # Blues
    "blue": "Blue",
    "navy": "Navy",
    "cobalt": "Cobalt Blue",
    "teal": "Teal",
    "turquoise": "Turquoise",
    "aqua": "Aqua",
    "indigo": "Indigo",
    "denim": "Denim Blue",
    "sky blue": "Sky Blue",
    "royal blue": "Royal Blue",
    "powder blue": "Powder Blue",
    "ice blue": "Ice Blue",
    "steel blue": "Steel Blue",
    # Greens
    "green": "Green",
    "olive": "Olive",
    "khaki": "Khaki",
    "sage": "Sage",
    "mint": "Mint",
    "forest": "Forest Green",
    "bottle green": "Bottle Green",
    "lime": "Lime",
    "emerald": "Emerald",
    "army": "Army Green",
    "pista": "Pista",
    "moss": "Moss Green",
    "hunter green": "Hunter Green",
    "jade": "Jade",
    # Reds & Pinks
    "red": "Red",
    "pink": "Pink",
    "maroon": "Maroon",
    "burgundy": "Burgundy",
    "wine": "Wine",
    "rust": "Rust",
    "coral": "Coral",
    "salmon": "Salmon",
    "blush": "Blush",
    "rose": "Rose",
    "fuchsia": "Fuchsia",
    "magenta": "Magenta",
    "cherry": "Cherry",
    "crimson": "Crimson",
    "raspberry": "Raspberry",
    "brick": "Brick Red",
    "tomato": "Tomato Red",
    "candy": "Candy Pink",
    # Yellows & Oranges
    "yellow": "Yellow",
    "orange": "Orange",
    "mustard": "Mustard",
    "gold": "Gold",
    "amber": "Amber",
    "peach": "Peach",
    "apricot": "Apricot",
    "lemon": "Lemon",
    "saffron": "Saffron",
    "copper": "Copper",
    "marigold": "Marigold",
    "mango": "Mango",
    # Purples
    "purple": "Purple",
    "lavender": "Lavender",
    "violet": "Violet",
    "lilac": "Lilac",
    "mauve": "Mauve",
    "plum": "Plum",
    "grape": "Grape",
    # Patterns (treated as color category)
    "multi": "Multicolor",
    "multicolor": "Multicolor",
    "printed": "Printed",
    "tie dye": "Tie Dye",
    "tie-dye": "Tie Dye",
    "camouflage": "Camouflage",
    "camo": "Camouflage",
    "stripe": "Striped",
    "check": "Checked",
    "floral": "Floral",
    # Metals
    "silver": "Silver",
    "chrome": "Silver",
    "rose gold": "Rose Gold",
}



def load_environment() -> None:
    # Next.js uses .env.local in root; scraper expects .env.
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    load_dotenv(SCRIPT_DIR / ".env", override=True)


def infer_color(text: str | None) -> str | None:
    if not text:
        return None
    lowered = text.lower()
    for key, value in COLOR_KEYWORDS.items():
        if key in lowered:
            return value
    return None


def get_supabase():
    load_environment()
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("Supabase environment variables missing.")
    return create_client(url, key)


def ensure_lookup_row(client, table: str, name: str, extra: dict | None = None) -> int:
    rows = (
        client.table(table)
        .select("id")
        .eq("name", name)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return rows[0]["id"]

    payload: dict = {"name": name}
    if extra:
        payload.update(extra)

    inserted = client.table(table).insert(payload).execute().data or []
    if not inserted:
        raise RuntimeError(f"Failed to insert row into {table} for name={name}")
    return inserted[0]["id"]


def fetch_shopify_products(base_url: str, max_pages: int = 5) -> list[dict]:
    """Fetches Shopify JSON products from a shopify base URL.

    Expects endpoints like:
      {base_url}/products.json?limit=250&page=2
    """

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
    }

    all_products: list[dict] = []
    page = 1
    while page <= max_pages:
        url = f"{base_url.rstrip('/')}/products.json?limit=250&page={page}"
        r = requests.get(url, headers=headers, timeout=20)
        if r.status_code != 200:
            logger.warning("Page %s returned %s", page, r.status_code)
            break

        payload = r.json() or {}
        products = payload.get("products") or []
        if not products:
            break

        all_products.extend(products)
        logger.info("Page %s: fetched %s raw products", page, len(products))
        page += 1

    return all_products


def parse_shopify_products(
    products: list[dict],
    source_name: str,
    category_name: str,
    base_url: str,
) -> list[dict]:
    scraped_at = datetime.now(timezone.utc).isoformat()
    results: list[dict] = []
    seen_urls: set[str] = set()

    for p in products:
        try:
            title = (p.get("title") or "").strip()
            if not title:
                continue

            vendor = (p.get("vendor") or "").strip() or source_name

            handle = p.get("handle")
            if not handle:
                continue

            product_url = f"{base_url.rstrip('/')}/products/{handle}"
            if product_url in seen_urls:
                continue
            seen_urls.add(product_url)

            variants = p.get("variants") or []
            variant0 = variants[0] if variants else {}

            # Shopify prices are numbers or strings.
            def to_float(x):
                try:
                    return float(x) if x is not None and x != "" else None
                except Exception:
                    return None

            price = to_float(variant0.get("price"))
            compare_at = to_float(variant0.get("compare_at_price"))

            original_price = None
            if compare_at is not None and price is not None and compare_at > price:
                original_price = compare_at

            discount_percentage = None
            if original_price is not None and price is not None and original_price > 0:
                discount_percentage = round((1 - price / original_price) * 100, 1)
                # sanity: if compare_at is wrong, discount can explode.
                if discount_percentage > 90:
                    discount_percentage = None

            image_url = None
            images = p.get("images") or []
            if images and isinstance(images, list):
                image_url = images[0].get("src")

            # Extract sizes and availability from variants
            all_variants = p.get("variants") or []
            sizes = []
            available_sizes = []
            for v in all_variants:
                size = v.get("option2") or v.get("option1")
                if size and size.upper() not in ("DEFAULT TITLE", "ONE SIZE"):
                    if size not in sizes:
                        sizes.append(size)
                    if v.get("available") and size not in available_sizes:
                        available_sizes.append(size)

            # Get color from option1 first (most accurate), fall back to title inference
            color = None
            if all_variants:
                option1 = (all_variants[0].get("option1") or "").strip()
                # option1 is color only if option2 exists (meaning option1=color, option2=size)
                if all_variants[0].get("option2"):
                    color = option1 if option1 else None

            if not color:
                color = infer_color(title)
            if not color:
                for tag in p.get("tags") or []:
                    color = infer_color(tag)
                    if color:
                        break

            # Filter tags — keep meaningful ones, drop internal codes
            SKIP_TAG_PATTERNS = {"cg-", "model-", "style-", "sku-"}
            raw_tags = p.get("tags") or []
            clean_tags = [
                t.strip() for t in raw_tags
                if t.strip() and not any(t.lower().startswith(pat) for pat in SKIP_TAG_PATTERNS)
            ]

            results.append(
                {
                    "title": title[:500],
                    "brand": vendor[:200],
                    "price": price,
                    "original_price": original_price,
                    "discount_percentage": discount_percentage,
                    "color": color,
                    "image_url": image_url,
                    "product_url": product_url,
                    "scraped_at": scraped_at,
                    "sizes": sizes or None,
                    "available_sizes": available_sizes or None,
                    "tags": clean_tags or None,
                }
            )
        except Exception as e:
            logger.warning("Failed to parse product: %s", e)
            continue

    return results


def run_shopify_scrape(source_name: str, category_name: str, base_url: str) -> int:
    client = get_supabase()

    source_id = ensure_lookup_row(client, "sources", source_name, {"base_url": base_url})
    category_id = ensure_lookup_row(client, "categories", category_name)

    run_payload = {
        "source_id": source_id,
        "category_id": category_id,
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "products_found": 0,
    }
    run_row = client.table("scrape_runs").insert(run_payload).execute().data or []
    if not run_row:
        raise RuntimeError("Failed to create scrape run")
    run_id = run_row[0]["id"]

    try:
        raw = fetch_shopify_products(base_url)
        logger.info("Fetched %s raw Shopify products from %s", len(raw), source_name)

        products = parse_shopify_products(raw, source_name, category_name, base_url)
        logger.info("Parsed %s valid Shopify products", len(products))

        if products:
            payload = [{"source_id": source_id, "category_id": category_id, **p} for p in products]
            batch_size = 100
            total = len(payload)
            for i in range(0, total, batch_size):
                batch = payload[i : i + batch_size]
                client.table("products").upsert(batch, on_conflict="product_url").execute()
                logger.info(
                    "Upserted batch %s/%s",
                    min(i + batch_size, total),
                    total,
                )


        client.table("scrape_runs").update(
            {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "products_found": len(products),
            }
        ).eq("id", run_id).execute()

        return len(products)

    except Exception as e:
        client.table("scrape_runs").update(
            {
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": str(e),
            }
        ).eq("id", run_id).execute()
        logger.error("Scrape failed: %s", e)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape Shopify JSON endpoints into Supabase")
    parser.add_argument("--source", required=True)
    parser.add_argument("--category", required=True)
    parser.add_argument("--url", required=True, help="Shop base URL, e.g. https://www.snitch.co.in")
    args = parser.parse_args()

    count = run_shopify_scrape(args.source, args.category, args.url)
    print(f"Saved {count} products")


if __name__ == "__main__":
    main()

