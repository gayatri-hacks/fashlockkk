from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin

from dotenv import load_dotenv
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
import requests
from supabase import create_client

from config import COLOR_KEYWORDS, DEFAULT_TEMPLATE, SOURCE_TEMPLATES, SelectorTemplate


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("fashion-scraper")
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent


def load_environment() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(SCRIPT_DIR / ".env", override=True)


@dataclass
class ScrapedProduct:
    title: str
    brand: str | None
    price: float | None
    original_price: float | None
    discount_percentage: float | None
    color: str | None
    image_url: str | None
    product_url: str
    scraped_at: str


def normalize_key(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def infer_color(title: str) -> str | None:
    lowered = title.lower()
    for key, value in COLOR_KEYWORDS.items():
        if key in lowered:
            return value
    return None


def parse_number(text: str | None) -> float | None:
    if not text:
        return None
    matches = re.findall(r"[\d,.]+", text.replace("₹", "").replace("$", ""))
    if not matches:
        return None
    try:
        return float(matches[0].replace(",", ""))
    except ValueError:
        return None


def parse_discount(text: str | None) -> float | None:
    if not text:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
    if match:
        return float(match.group(1))
    return None


def pick_first_text(card, selectors: Iterable[str]) -> str | None:
    for selector in selectors:
        try:
            locator = card.locator(selector).first
            if locator.count() == 0:
                continue
            text = locator.text_content()
            if text and text.strip():
                return text.strip()
        except Exception:
            continue
    return None


def pick_first_attr(card, selectors: Iterable[str], attribute: str) -> str | None:
    for selector in selectors:
        try:
            locator = card.locator(selector).first
            if locator.count() == 0:
                continue
            value = locator.get_attribute(attribute)
            if value:
                return value
        except Exception:
            continue
    return None


def get_selector_template(source_name: str) -> SelectorTemplate:
    return SOURCE_TEMPLATES.get(normalize_key(source_name), DEFAULT_TEMPLATE)


def get_launch_args(source_name: str) -> list[str]:
    args = [
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
    ]
    if normalize_key(source_name) == "myntra":
        args.extend(["--disable-http2", "--disable-quic"])
    return args


def get_request_headers(source_name: str) -> dict[str, str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    }
    if normalize_key(source_name) == "myntra":
        headers["Referer"] = "https://www.myntra.com/"
    return headers


def load_listing_page(page, source_name: str, listing_url: str) -> None:
    errors: list[Exception] = []
    wait_strategies = ("domcontentloaded", "load")

    for wait_until in wait_strategies:
        try:
            logger.info("Loading %s with wait_until=%s", listing_url, wait_until)
            page.goto(listing_url, wait_until=wait_until, timeout=120_000)
            try:
                page.wait_for_load_state("networkidle", timeout=20_000)
            except PlaywrightTimeoutError:
                logger.info("Network idle timeout reached; continuing with loaded content.")
            return
        except Exception as exc:
            errors.append(exc)
            logger.warning("Navigation attempt failed with %s: %s", wait_until, exc)

    if normalize_key(source_name) == "myntra":
        logger.warning("Falling back to HTML fetch for Myntra after browser navigation failed.")
        response = requests.get(listing_url, headers=get_request_headers(source_name), timeout=40)
        response.raise_for_status()
        page.set_content(response.text, wait_until="domcontentloaded")
        return

    if errors:
        raise errors[-1]


def load_myntra_html(page, listing_url: str) -> bool:
    logger.info("Trying Myntra HTML fetch fallback first.")
    response = requests.get(listing_url, headers=get_request_headers("myntra"), timeout=40)
    response.raise_for_status()
    page.set_content(response.text, wait_until="domcontentloaded")
    return True


def scroll_page(page) -> None:
    previous_height = 0
    for _ in range(12):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(900)
        current_height = page.evaluate("document.body.scrollHeight")
        if current_height == previous_height:
            break
        previous_height = current_height


def extract_products(page, source_name: str, category_name: str, listing_url: str) -> list[ScrapedProduct]:
    template = get_selector_template(source_name)
    cards = None
    for selector in template.card_selectors:
        try:
            locator = page.locator(selector)
            count = locator.count()
            if count > 0:
                cards = locator
                logger.info("Using selector %s for %s", selector, source_name)
                break
        except Exception:
            continue

    if cards is None:
        logger.warning("No source-specific card selector matched. Falling back to template selectors.")
        fallback_selector = ", ".join(DEFAULT_TEMPLATE.card_selectors)
        cards = page.locator(fallback_selector)

    # ---- Flipkart special path ----
    if normalize_key(source_name) == "flipkart":
        links = page.query_selector_all("a[href*='/p/']")
        seen_urls: set[str] = set()
        results: list[ScrapedProduct] = []
        scraped_at = datetime.now(timezone.utc).isoformat()
        for link in links:
            try:
                href = link.get_attribute("href")
                if not href:
                    continue
                product_url = urljoin(listing_url, href)
                if product_url in seen_urls:
                    continue
                seen_urls.add(product_url)

                raw = page.evaluate(
                    "el => el.closest('div[data-id]') ? el.closest('div[data-id]').innerText : el.parentElement.innerText",
                    link,
                )
                lines = [l.strip() for l in raw.splitlines() if l.strip()]
                if not lines:
                    continue

                title = link.get_attribute("title") or lines[0]
                brand = lines[0] if len(lines) > 1 else None

                price, original_price, discount_percentage = None, None, None
                for line in lines:
                    if "₹" in line:
                        # extract discount percentage first, before modifying the line
                        # discount is typically 1-2 digits (1-99%)
                        m_discount = re.search(r"(\d{1,2})%\s*off", line, re.IGNORECASE)
                        if m_discount:
                            d = float(m_discount.group(1))
                            if 1 <= d <= 90:
                                discount_percentage = d
                        
                        # strip the "NN% off" suffix so it doesn't corrupt price parsing
                        clean_line = re.sub(r'\d{1,2}%\s*off', '', line, flags=re.IGNORECASE).strip()
                        rupee_amounts = re.findall(r"₹([\d,]+)", clean_line)
                        parsed = []
                        for amt in rupee_amounts:
                            try:
                                val = float(amt.replace(",", ""))
                                if val <= 100000:
                                    parsed.append(val)
                            except ValueError:
                                continue
                        if len(parsed) >= 2:
                            price, original_price = parsed[0], parsed[1]
                        elif len(parsed) == 1:
                            if price is None:
                                price = parsed[0]

                if discount_percentage is None and price and original_price and original_price > 0:
                    calculated = round((1 - price / original_price) * 100, 1)
                    discount_percentage = calculated if 1 <= calculated <= 90 else None

                image_url = None
                try:
                    img = link.query_selector("img") or page.evaluate(
                        "el => el.closest('div[data-id]') ? el.closest('div[data-id]').querySelector('img') : null",
                        link,
                    )
                    if img:
                        image_url = img.get_attribute("src") if hasattr(img, "get_attribute") else None
                except Exception:
                    pass

                color = infer_color(title)
                results.append(ScrapedProduct(
                    title=title[:500],
                    brand=(brand[:200] if brand else None),
                    price=price,
                    original_price=original_price,
                    discount_percentage=discount_percentage,
                    color=color,
                    image_url=image_url,
                    product_url=product_url,
                    scraped_at=scraped_at,
                ))
            except Exception as exc:
                logger.warning("Flipkart card failed: %s", exc)
                continue
        return results
    # ---- end Flipkart path ----

    scraped_at = datetime.now(timezone.utc).isoformat()
    results: list[ScrapedProduct] = []
    seen_urls: set[str] = set()
    total_cards = min(cards.count(), 120)

    for index in range(total_cards):
        card = cards.nth(index)
        try:
            title = pick_first_text(card, template.title_selectors) or pick_first_text(card, DEFAULT_TEMPLATE.title_selectors)
            if not title:
                continue

            brand = pick_first_text(card, template.brand_selectors) or pick_first_text(card, DEFAULT_TEMPLATE.brand_selectors)
            price_text = pick_first_text(card, template.price_selectors) or pick_first_text(card, DEFAULT_TEMPLATE.price_selectors)
            original_price_text = pick_first_text(card, template.original_price_selectors) or pick_first_text(card, DEFAULT_TEMPLATE.original_price_selectors)
            discount_text = pick_first_text(card, template.discount_selectors) or pick_first_text(card, DEFAULT_TEMPLATE.discount_selectors)

            price = parse_number(price_text)
            original_price = parse_number(original_price_text)
            parsed_discount = parse_discount(discount_text)
            # Cap discount at 90% and require >= 1%
            discount_percentage = parsed_discount if parsed_discount and 1 <= parsed_discount <= 90 else None
            if discount_percentage is None and price and original_price and original_price > 0:
                calculated = round((1 - price / original_price) * 100, 1)
                discount_percentage = calculated if 1 <= calculated <= 90 else None

            image_url = pick_first_attr(card, template.image_selectors, "src") or pick_first_attr(card, DEFAULT_TEMPLATE.image_selectors, "src")
            if image_url and image_url.startswith("//"):
                image_url = f"https:{image_url}"

            href = pick_first_attr(card, template.link_selectors, "href") or pick_first_attr(card, DEFAULT_TEMPLATE.link_selectors, "href")
            if href:
                product_url = urljoin(listing_url, href)
            else:
                product_url = f"{listing_url.rstrip('/')}/product-{index + 1}"

            if product_url in seen_urls:
                continue
            seen_urls.add(product_url)

            color = infer_color(title)
            if color is None and image_url:
                color = infer_color(image_url)

            results.append(
                ScrapedProduct(
                    title=title[:500],
                    brand=(brand[:200] if brand else None),
                    price=price,
                    original_price=original_price,
                    discount_percentage=discount_percentage,
                    color=color,
                    image_url=image_url,
                    product_url=product_url,
                    scraped_at=scraped_at,
                )
            )
        except Exception as exc:
            logger.warning("Failed to extract card %s: %s", index, exc)
            continue

    return results


def ensure_lookup_row(client, table_name: str, name: str, extra: dict | None = None) -> int:
    select_result = client.table(table_name).select("id").eq("name", name).limit(1).execute()
    rows = select_result.data or []
    if rows:
        return rows[0]["id"]

    payload = {"name": name}
    if extra:
        payload.update(extra)
    insert_result = client.table(table_name).insert(payload).execute()
    return insert_result.data[0]["id"]


def create_scrape_run(client, source_id: int, category_id: int) -> int:
    payload = {
        "source_id": source_id,
        "category_id": category_id,
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "products_found": 0,
    }
    result = client.table("scrape_runs").insert(payload).execute()
    return result.data[0]["id"]


def update_scrape_run(client, run_id: int, status: str, products_found: int = 0, error_message: str | None = None) -> None:
    payload = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "products_found": products_found,
        "error_message": error_message,
    }
    client.table("scrape_runs").update(payload).eq("id", run_id).execute()


def save_products(client, source_id: int, category_id: int, products: list[ScrapedProduct]) -> None:
    if not products:
        return

    payload = [
        {
            "source_id": source_id,
            "category_id": category_id,
            **asdict(product),
            "price": product.price,
            "original_price": product.original_price,
            "discount_percentage": product.discount_percentage,
        }
        for product in products
    ]

    # product_url has a unique constraint in the schema. Upsert prevents duplicates.
    client.table("products").upsert(payload, on_conflict="product_url").execute()


def run_scrape(source_name: str, category_name: str, listing_url: str, headless: bool = True) -> int:
    load_environment()
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase environment variables are missing.")

    client = create_client(supabase_url, supabase_key)
    source_id = ensure_lookup_row(client, "sources", source_name, {"base_url": listing_url})
    category_id = ensure_lookup_row(client, "categories", category_name)
    scrape_run_id = create_scrape_run(client, source_id, category_id)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless, args=get_launch_args(source_name))
            page = browser.new_page(viewport={"width": 1440, "height": 2200})
            page.set_extra_http_headers(get_request_headers(source_name))
            used_html_fallback = False
            if normalize_key(source_name) == "myntra":
                try:
                    used_html_fallback = load_myntra_html(page, listing_url)
                except Exception as exc:
                    logger.warning("Myntra HTML fallback failed: %s", exc)
                    used_html_fallback = False

            if not used_html_fallback:
                load_listing_page(page, source_name, listing_url)

            scroll_page(page)
            products = extract_products(page, source_name, category_name, listing_url)

            if normalize_key(source_name) == "myntra" and used_html_fallback and not products:
                logger.info("HTML fallback returned no products, retrying Myntra with browser navigation.")
                load_listing_page(page, source_name, listing_url)
                scroll_page(page)
                products = extract_products(page, source_name, category_name, listing_url)

            browser.close()

        logger.info("Extracted %s products for %s / %s", len(products), source_name, category_name)
        save_products(client, source_id, category_id, products)
        update_scrape_run(client, scrape_run_id, "completed", len(products))
        logger.info("Scrape completed successfully.")
        return len(products)
    except Exception as exc:
        logger.exception("Scrape failed")
        update_scrape_run(client, scrape_run_id, "failed", 0, str(exc))
        raise


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape fashion ecommerce listings into Supabase.")
    parser.add_argument("--source", required=True, help="Source name, for example Myntra.")
    parser.add_argument("--category", required=True, help="Category name, for example Women Tops.")
    parser.add_argument("--url", required=True, help="Listing URL to scrape.")
    parser.add_argument("--headed", action="store_true", help="Run Playwright with a visible browser.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    headless = not args.headed

    try:
        count = run_scrape(args.source, args.category, args.url, headless=headless)
        print(f"Saved {count} products")
        return 0
    except Exception as exc:
        logger.error("Scrape failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
