-- Enable pgvector extension for CLIP embeddings
create extension if not exists vector;

-- Extend sources with type, gender, category metadata
alter table sources
  add column if not exists source_type text check (source_type in ('shopify', 'flipkart', 'custom')),
  add column if not exists gender text check (gender in ('men', 'women', 'unisex', 'kids')),
  add column if not exists category text,
  add column if not exists is_active boolean not null default true;

-- Extend products with size, tags, gender for body type filtering later
alter table products
  add column if not exists tags text[],
  add column if not exists sizes text[],
  add column if not exists available_sizes text[],
  add column if not exists gender text check (gender in ('men', 'women', 'unisex', 'kids')),
  add column if not exists embedding vector(512); -- for CLIP later

-- Index gender on products for body type queries
create index if not exists products_gender_idx on products (gender);

-- Extend trend_snapshots with detailed signal breakdown
-- Now stores: blended composite score + individual signal scores + actual WoW growth
alter table trend_snapshots
  add column if not exists blended_score numeric,           -- 5-signal composite (Google 30%, YouTube 20%, Flipkart 25%, Reddit 10%, new arrivals 10%, discounts -5%)
  add column if not exists google_score numeric,            -- Google Trends normalized 0-100
  add column if not exists youtube_score numeric,           -- YouTube Trends normalized 0-100
  add column if not exists reddit_score numeric,            -- Reddit mentions normalized 0-100
  add column if not exists flipkart_growth numeric;         -- Actual WoW % growth (separate from composite score)

-- Index blended_score and status for dashboard queries
create index if not exists trend_snapshots_blended_score_idx on trend_snapshots (blended_score desc);
create index if not exists trend_snapshots_status_idx on trend_snapshots (status);

-- Insert/update Vastrado with new schema
insert into sources (name, base_url, source_type, gender, category)
values ('Vastrado', 'https://www.vastrado.com', 'shopify', 'men', 'casual')
on conflict (name) do update
  set base_url = excluded.base_url,
      source_type = excluded.source_type,
      gender = excluded.gender,
      category = excluded.category;
