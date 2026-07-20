-- Additive only. Formula assets are separate from trend_concept card covers.
create table if not exists trend_style_evidence (
  id uuid primary key default gen_random_uuid(), trend_id bigint not null, canonical_keyword text not null,
  audience text not null check (audience in ('women','men')), region text not null, season text not null,
  garment_pairings jsonb not null default '[]', silhouettes jsonb not null default '[]', materials jsonb not null default '[]',
  colours jsonb not null default '[]', footwear jsonb not null default '[]', accessories jsonb not null default '[]',
  styling_techniques jsonb not null default '[]', source_url text not null, source_domain text not null,
  short_extract text not null check (length(short_extract) <= 500), observed_at timestamptz not null,
  quality_score numeric not null check (quality_score between 0 and 1), recency_score numeric not null check (recency_score between 0 and 1),
  created_at timestamptz not null default now(), unique(trend_id,audience,source_url,observed_at)
);
create index if not exists trend_style_evidence_lookup_idx on trend_style_evidence(trend_id,audience,region,observed_at desc);

create table if not exists trend_outfit_formulas (
  id uuid primary key default gen_random_uuid(), trend_id bigint not null, canonical_keyword text not null,
  audience text not null check (audience in ('women','men')),
  formula_slot text not null check (formula_slot in ('easy_entry','current_uniform','editorial_push')),
  title text not null, items jsonb not null, footwear text not null, accessories jsonb not null default '[]',
  occasion text not null, climate text not null, season text not null, region text not null, why_it_works text not null,
  evidence_ids uuid[] not null, confidence numeric not null check (confidence between 0 and 1), evidence_hash text not null,
  formula_hash text not null, generated_at timestamptz not null, valid_until timestamptz not null,
  review_status text not null default 'draft' check (review_status in ('draft','pending_review','approved','rejected','superseded')),
  supersedes_id uuid references trend_outfit_formulas(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists trend_outfit_formulas_hash_uidx on trend_outfit_formulas(formula_hash);
create unique index if not exists trend_outfit_formulas_approved_slot_uidx on trend_outfit_formulas(trend_id,audience,region,formula_slot) where review_status='approved';
create index if not exists trend_outfit_formulas_read_idx on trend_outfit_formulas(trend_id,audience,region,review_status,valid_until desc);

create table if not exists trend_formula_feedback (
  id uuid primary key default gen_random_uuid(), formula_id uuid not null references trend_outfit_formulas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, anonymous_session_hash text,
  action text not null check (action in ('saved','not_for_me','wore_it','swapped_item','opened_in_laila')),
  metadata jsonb not null default '{}', created_at timestamptz not null default now(),
  check (user_id is not null or anonymous_session_hash is not null)
);
create index if not exists trend_formula_feedback_formula_idx on trend_formula_feedback(formula_id,action,created_at desc);

alter table trend_style_evidence enable row level security;
alter table trend_outfit_formulas enable row level security;
alter table trend_formula_feedback enable row level security;
create policy "Public read approved trend formulas" on trend_outfit_formulas for select using (review_status='approved');
create policy "Authenticated insert trend formula feedback" on trend_formula_feedback for insert to authenticated with check (auth.uid()=user_id);

-- Separate formula outfit variants; trend_concept remains unchanged.
alter table generated_fashion_images drop constraint if exists generated_fashion_images_variant_check;
alter table generated_fashion_images add constraint generated_fashion_images_variant_check
  check (variant in ('trend_concept','trend_hero','trend_women','trend_men','deep_dive','daily_edit','trend_formula_women','trend_formula_men')) not valid;
alter table generated_fashion_images validate constraint generated_fashion_images_variant_check;
alter table image_generation_jobs drop constraint if exists image_generation_jobs_variant_check;
alter table image_generation_jobs add constraint image_generation_jobs_variant_check
  check (variant in ('trend_concept','trend_hero','trend_women','trend_men','deep_dive','daily_edit','trend_formula_women','trend_formula_men')) not valid;
alter table image_generation_jobs validate constraint image_generation_jobs_variant_check;
