from __future__ import annotations
import os, time, logging
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
from playwright.sync_api import sync_playwright
import re

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("global-shopify-browser")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

SOURCES = [
    {"id": 25, "name": "Revolve",          "url": "https://www.revolve.com/new",          "market": "US", "selector": "a.productTile"},
    {"id": 26, "name": "Urban Outfitters", "url": "https://www.urbanoutfitters.com/search?q=new",  "market": "US", "selector": "figure.product-card"},
    {"id": 27, "name": "Yesstyle",         "url": "https://www.yesstyle.com/en/new-arrivals/ccat",  "market": "KR", "selector": "div.productCardImg"},
    {"id": 28, "name": "SSENSE",           "url": "https://www.ssense.com/en-us/mens/new",  "market": "CA", "selector": "a[data-test-id='product-tile']"},
    {"id": 29, "name": "Free People",      "url": "https://www.freepeople.com/shop/new-clothing",  "market": "US", "selector": "div.product-item"},
    {"id": 30, "name": "Shein",            "url": "https://us.shein.com/new-in-sc-01d3e5.html",  "market": "US", "selector": "div.goods-item"},
]

def get_supabase():
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key)

def scrape_with_playwright(source: dict) -> list[dict]:
    """Scrape products using Playwright for bot-protected sites"""
    products = []
    
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            logger.info("  Loading %s...", source["name"])
            page.goto(source["url"], wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(3000)  # Wait for JS to render
            
            # Scroll to load more
            for _ in range(3):
                page.evaluate("window.scrollBy(0, 1000)")
                page.wait_for_timeout(1000)
            
            # Get all product links/cards
            elements = page.query_selector_all(source["selector"])
            logger.info("  Found %d product elements", len(elements))
            
            for elem in elements[:100]:  # Limit to 100 per source
                try:
                    # Try to extract title and link
                    title = None
                    link = None
                    price = None
                    
                    # Generic extraction
                    title_elem = elem.query_selector("[data-test-id*='title'], h2, h3, .product-title, .product-name, .itemName")
                    if title_elem:
                        title = title_elem.inner_text().strip()
                    
                    link_elem = elem.query_selector("a[href*='product'], a[href*='item']")
                    if link_elem:
                        link = link_elem.get_attribute("href")
                    
                    price_elem = elem.query_selector("[data-test-id*='price'], .price, .product-price, .itemPrice")
                    if price_elem:
                        price_text = price_elem.inner_text().strip()
                        # Extract number
                        match = re.search(r'\d+\.?\d*', price_text.replace(",", ""))
                        if match:
                            price = float(match.group())
                    
                    if title:
                        products.append({
                            "source_id": source["id"],
                            "external_id": link or f"{source['name']}-{len(products)}",
                            "title": title,
                            "price": price,
                            "image_url": None,
                            "tags": [],
                            "product_type": None,
                            "market": source["market"],
                            "url": link or "",
                        })
                except Exception as e:
                    logger.debug("  Error parsing element: %s", e)
                    continue
            
            browser.close()
    except Exception as e:
        logger.error("Playwright error for %s: %s", source["name"], e)
    
    return products

def save_products(client, products: list[dict], source_name: str):
    """Upsert products to Supabase in batches"""
    if not products:
        return

    batch_size = 100
    saved = 0

    for i in range(0, len(products), batch_size):
        batch = products[i:i + batch_size]
        try:
            client.table("products").upsert(
                batch,
                on_conflict="source_id,external_id"
            ).execute()
            saved += len(batch)
        except Exception as e:
            logger.warning("Save error for %s: %s", source_name, e)

    logger.info("Saved %d products for %s", saved, source_name)

def main():
    client = get_supabase()

    for source in SOURCES:
        logger.info("=== Scraping %s (ID %d, market %s) ===",
                    source["name"], source["id"], source["market"])

        products = scrape_with_playwright(source)
        logger.info("Scraped %d products from %s", len(products), source["name"])
        
        if products:
            save_products(client, products, source["name"])
        
        logger.info("Sleeping 20s before next source...")
        time.sleep(20)

    logger.info("=== All sources done ===")

if __name__ == "__main__":
    main()
