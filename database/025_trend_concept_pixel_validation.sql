-- Additive pixel/semantic validation metadata for the trend_concept pipeline.
-- Apply manually in Supabase before running the upgraded concept worker.

alter table generated_fashion_images
  add column if not exists dominant_colors text[] not null default '{}',
  add column if not exists pixel_integrity_hash text,
  add column if not exists generator_provider text,
  add column if not exists generator_model text,
  add column if not exists approved_at timestamptz;

alter table trend_concept_image_reviews
  add column if not exists canonical_keyword text,
  add column if not exists prompt text,
  add column if not exists generator_provider text,
  add column if not exists generator_model text,
  add column if not exists validated_at timestamptz not null default now(),
  add column if not exists approved_at timestamptz;

alter table trend_concept_image_candidates
  add column if not exists prompt text,
  add column if not exists generator_provider text,
  add column if not exists generator_model text,
  add column if not exists ocr_result jsonb not null default '{}'::jsonb,
  add column if not exists semantic_result jsonb not null default '{}'::jsonb,
  add column if not exists perceptual_hash text,
  add column if not exists dominant_colors text[] not null default '{}',
  add column if not exists validated_at timestamptz not null default now();

create index if not exists trend_concept_image_candidates_pixel_idx
  on trend_concept_image_candidates (perceptual_hash, passed, validated_at desc);
