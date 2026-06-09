create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists style_knowledge (
  id uuid primary key default gen_random_uuid(),
  source text,
  source_url text unique,
  title text,
  content text,
  category text check (category in ('body_type', 'colour', 'occasion', 'capsule', 'mens', 'womens', 'general')),
  gender text check (gender in ('male', 'female', 'both')),
  embedding vector(768),
  created_at timestamp default now()
);

create index if not exists style_knowledge_category_idx on style_knowledge (category);
create index if not exists style_knowledge_gender_idx on style_knowledge (gender);
create index if not exists style_knowledge_created_at_idx on style_knowledge (created_at desc);

create table if not exists style_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  gender text,
  messages jsonb default '[]'::jsonb,
  style_keywords text[] default '{}',
  categories_explored text[] default '{}',
  products_clicked jsonb default '[]'::jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists style_sessions_session_id_idx on style_sessions (session_id);
create index if not exists style_sessions_updated_at_idx on style_sessions (updated_at desc);

create table if not exists style_interactions (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  message text,
  response_id text,
  action text check (action in ('click', 'save', 'ignore', 'follow_up')),
  product_url text,
  created_at timestamp default now()
);

create index if not exists style_interactions_session_id_idx on style_interactions (session_id);
create index if not exists style_interactions_created_at_idx on style_interactions (created_at desc);
