-- Additive pixel/semantic validation metadata for the trend_concept pipeline.
-- Apply manually in Supabase before running the upgraded concept worker.

alter table image_generation_jobs
  drop constraint if exists image_generation_jobs_status_check;

alter table image_generation_jobs
  add constraint image_generation_jobs_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'failed_review', 'retryable_review'))
  not valid;

alter table image_generation_jobs
  validate constraint image_generation_jobs_status_check;

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

create index if not exists image_generation_jobs_retryable_review_idx
  on image_generation_jobs (updated_at)
  where status = 'retryable_review';

create index if not exists trend_concept_image_candidates_pixel_idx
  on trend_concept_image_candidates (perceptual_hash, passed, validated_at desc);

create or replace function claim_next_image_generation_job(
  worker_id text,
  lock_timeout_minutes integer default 30
)
returns setof image_generation_jobs as $$
begin
  update image_generation_jobs
  set
    status = case when attempts >= max_attempts then 'failed' else 'pending' end,
    locked_at = null,
    locked_by = null,
    error_message = coalesce(error_message, 'Worker lock expired')
  where status = 'processing'
    and locked_at < now() - make_interval(mins => lock_timeout_minutes);

  update image_generation_jobs
  set
    status = case when attempts >= max_attempts then 'failed' else 'pending' end,
    locked_at = null,
    locked_by = null
  where status = 'retryable_review'
    and coalesce(nullif(metadata->>'retryAfter', '')::timestamptz, now()) <= now();

  return query
  with next_job as (
    select id
    from image_generation_jobs
    where status = 'pending'
      and attempts < max_attempts
    order by priority desc, created_at asc
    for update skip locked
    limit 1
  )
  update image_generation_jobs jobs
  set
    status = 'processing',
    locked_at = now(),
    locked_by = worker_id,
    attempts = jobs.attempts + 1,
    error_message = null
  from next_job
  where jobs.id = next_job.id
  returning jobs.*;
end;
$$ language plpgsql security definer;

revoke all on function claim_next_image_generation_job(text, integer) from public, anon, authenticated;
grant execute on function claim_next_image_generation_job(text, integer) to service_role;

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
    dominant_colors,
    composition_mode,
    material_family,
    perceptual_hash,
    pixel_integrity_hash,
    generator_provider,
    generator_model,
    approved_at,
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
    coalesce(array(select jsonb_array_elements_text(finished_job.metadata->'dominantColors')), '{}'),
    finished_job.metadata->>'compositionMode',
    finished_job.metadata->>'materialFamily',
    finished_job.metadata->>'perceptualHash',
    finished_job.metadata->>'pixelIntegrityHash',
    finished_job.metadata->>'generatorProvider',
    finished_job.metadata->>'generatorModel',
    case
      when coalesce(finished_job.metadata->>'reviewStatus', finished_job.metadata->>'validationStatus') = 'accepted'
      then now()
      else null
    end,
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
    dominant_colors = excluded.dominant_colors,
    composition_mode = excluded.composition_mode,
    material_family = excluded.material_family,
    perceptual_hash = excluded.perceptual_hash,
    pixel_integrity_hash = excluded.pixel_integrity_hash,
    generator_provider = excluded.generator_provider,
    generator_model = excluded.generator_model,
    approved_at = excluded.approved_at,
    completed_at = excluded.completed_at;

  return finished_job;
end;
$$ language plpgsql security definer;

revoke all on function complete_image_generation_job(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function complete_image_generation_job(uuid, text, text, jsonb) to service_role;
