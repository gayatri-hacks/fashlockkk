-- Additive audit layer for trend_concept generate -> validate -> select -> publish.
-- Do not execute automatically from the app; apply manually in Supabase when ready.

update storage.buckets
set allowed_mime_types = array['image/png', 'image/webp']
where id = 'generated-fashion-images';

alter table image_generation_jobs
  drop constraint if exists image_generation_jobs_status_check;

alter table image_generation_jobs
  add constraint image_generation_jobs_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'failed_review'))
  not valid;

alter table image_generation_jobs
  validate constraint image_generation_jobs_status_check;

alter table generated_fashion_images
  add column if not exists review_status text not null default 'legacy'
    check (review_status in ('legacy', 'accepted', 'failed_review')),
  add column if not exists prompt_version text,
  add column if not exists brief_version text,
  add column if not exists validation_version text,
  add column if not exists validation_summary jsonb not null default '{}'::jsonb,
  add column if not exists selected_candidate_index integer,
  add column if not exists candidate_count integer,
  add column if not exists dominant_palette text,
  add column if not exists dominant_color text,
  add column if not exists composition_mode text,
  add column if not exists material_family text,
  add column if not exists perceptual_hash text;

create index if not exists generated_fashion_images_review_idx
  on generated_fashion_images (entity_type, entity_id, variant, review_status, completed_at desc);

create index if not exists generated_fashion_images_version_idx
  on generated_fashion_images (variant, prompt_version, brief_version, review_status);

create table if not exists trend_concept_image_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references image_generation_jobs(id) on delete set null,
  entity_type text not null default 'trend',
  entity_id bigint not null,
  variant text not null default 'trend_concept',
  prompt_hash text not null,
  prompt_version text,
  brief_version text,
  validation_version text not null,
  review_status text not null
    check (review_status in ('accepted', 'failed_review')),
  selected_candidate_index integer,
  candidate_count integer not null default 0,
  brief jsonb not null default '{}'::jsonb,
  validation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trend_concept_image_reviews_entity_idx
  on trend_concept_image_reviews (entity_type, entity_id, variant, created_at desc);

create index if not exists trend_concept_image_reviews_status_idx
  on trend_concept_image_reviews (review_status, created_at desc);

create table if not exists trend_concept_image_candidates (
  id uuid primary key default gen_random_uuid(),
  review_id uuid references trend_concept_image_reviews(id) on delete cascade,
  job_id uuid references image_generation_jobs(id) on delete set null,
  candidate_index integer not null,
  passed boolean not null default false,
  score numeric not null default 0,
  rejection_reasons text[] not null default '{}',
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trend_concept_image_candidates_review_idx
  on trend_concept_image_candidates (review_id, candidate_index);

create or replace function complete_image_generation_job(
  job_id uuid,
  completed_image_url text,
  completed_storage_path text,
  completed_metadata jsonb default '{}'::jsonb
)
returns image_generation_jobs as $$
declare
  finished_job image_generation_jobs;
begin
  update image_generation_jobs
  set
    status = 'completed',
    image_url = completed_image_url,
    storage_path = completed_storage_path,
    metadata = metadata || completed_metadata,
    locked_at = null,
    locked_by = null,
    error_message = null,
    completed_at = now()
  where id = job_id
  returning * into finished_job;

  if finished_job.id is null then
    raise exception 'Image generation job % not found', job_id;
  end if;

  insert into generated_fashion_images (
    entity_type,
    entity_id,
    variant,
    prompt_hash,
    model,
    image_size,
    storage_path,
    image_url,
    metadata,
    review_status,
    prompt_version,
    brief_version,
    validation_version,
    validation_summary,
    selected_candidate_index,
    candidate_count,
    dominant_palette,
    dominant_color,
    composition_mode,
    material_family,
    perceptual_hash,
    completed_at
  )
  values (
    finished_job.entity_type,
    finished_job.entity_id,
    finished_job.variant,
    finished_job.prompt_hash,
    finished_job.model,
    finished_job.image_size,
    completed_storage_path,
    completed_image_url,
    finished_job.metadata,
    coalesce(finished_job.metadata->>'reviewStatus', finished_job.metadata->>'validationStatus', 'legacy'),
    finished_job.metadata->>'promptVersion',
    finished_job.metadata->>'briefVersion',
    finished_job.metadata->>'validationVersion',
    coalesce(finished_job.metadata->'validationResults', '{}'::jsonb),
    nullif(finished_job.metadata->>'selectedCandidateIndex', '')::integer,
    nullif(finished_job.metadata->>'candidateCount', '')::integer,
    finished_job.metadata->>'dominantPalette',
    finished_job.metadata->>'dominantColor',
    finished_job.metadata->>'compositionMode',
    finished_job.metadata->>'materialFamily',
    finished_job.metadata->>'perceptualHash',
    now()
  )
  on conflict (entity_type, entity_id, variant, prompt_hash)
  do update set
    model = excluded.model,
    image_size = excluded.image_size,
    storage_path = excluded.storage_path,
    image_url = excluded.image_url,
    metadata = excluded.metadata,
    review_status = excluded.review_status,
    prompt_version = excluded.prompt_version,
    brief_version = excluded.brief_version,
    validation_version = excluded.validation_version,
    validation_summary = excluded.validation_summary,
    selected_candidate_index = excluded.selected_candidate_index,
    candidate_count = excluded.candidate_count,
    dominant_palette = excluded.dominant_palette,
    dominant_color = excluded.dominant_color,
    composition_mode = excluded.composition_mode,
    material_family = excluded.material_family,
    perceptual_hash = excluded.perceptual_hash,
    completed_at = excluded.completed_at;

  return finished_job;
end;
$$ language plpgsql security definer;

revoke all on function complete_image_generation_job(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function complete_image_generation_job(uuid, text, text, jsonb) to service_role;

alter table trend_concept_image_reviews enable row level security;
alter table trend_concept_image_candidates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trend_concept_image_reviews' and policyname = 'trend concept image reviews are readable'
  ) then
    create policy "trend concept image reviews are readable"
      on trend_concept_image_reviews for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trend_concept_image_candidates' and policyname = 'trend concept image candidates are readable'
  ) then
    create policy "trend concept image candidates are readable"
      on trend_concept_image_candidates for select
      using (true);
  end if;
end $$;
