create extension if not exists pgcrypto;

create table if not exists wardrobe_items (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  image_url text not null,
  category text not null,
  color text,
  name text,
  tags text[],
  created_at timestamp default now()
);

create table if not exists saved_outfits (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  item_ids text[] not null,
  occasion text,
  gemini_feedback text,
  created_at timestamp default now()
);

create index if not exists wardrobe_items_user_created_idx
  on wardrobe_items (user_id, created_at desc);

create index if not exists saved_outfits_user_created_idx
  on saved_outfits (user_id, created_at desc);
