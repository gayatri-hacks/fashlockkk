-- Add sizes + available_sizes to products (needed by scraper/scrape_shopify.py)

-- Use text[] so we can store list of size strings.
-- If your scraper sends NULL, this works fine.

alter table products
  add column if not exists sizes text[];

alter table products
  add column if not exists available_sizes text[];

