create extension if not exists pgcrypto;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'generated-fashion-images',
  'generated-fashion-images',
  true,
  10485760,
  array['image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read generated fashion images" on storage.objects;
create policy "Public read generated fashion images"
  on storage.objects
  for select
  using (bucket_id = 'generated-fashion-images');

create table if not exists generated_fashion_images (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('trend')),
  entity_id bigint not null,
  variant text not null check (variant in ('trend_hero', 'trend_women', 'trend_men', 'deep_dive', 'daily_edit')),
  prompt_hash text not null,
  model text not null,
  image_size text not null,
  storage_path text not null,
  image_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists generated_fashion_images_entity_variant_hash_uidx
  on generated_fashion_images (entity_type, entity_id, variant, prompt_hash);

create index if not exists generated_fashion_images_lookup_idx
  on generated_fashion_images (entity_type, entity_id, variant, completed_at desc);

create table if not exists image_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('trend')),
  entity_id bigint not null,
  variant text not null check (variant in ('trend_hero', 'trend_women', 'trend_men', 'deep_dive', 'daily_edit')),
  prompt text not null,
  prompt_hash text not null,
  model text not null,
  image_size text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  storage_path text,
  image_url text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists image_generation_jobs_entity_variant_hash_uidx
  on image_generation_jobs (entity_type, entity_id, variant, prompt_hash);

create index if not exists image_generation_jobs_pending_idx
  on image_generation_jobs (priority desc, created_at asc)
  where status = 'pending';

create index if not exists image_generation_jobs_entity_idx
  on image_generation_jobs (entity_type, entity_id, variant, status);

create index if not exists image_generation_jobs_processing_idx
  on image_generation_jobs (locked_at)
  where status = 'processing';

create or replace function set_image_generation_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists generated_fashion_images_updated_at on generated_fashion_images;
create trigger generated_fashion_images_updated_at
  before update on generated_fashion_images
  for each row execute function set_image_generation_updated_at();

drop trigger if exists image_generation_jobs_updated_at on image_generation_jobs;
create trigger image_generation_jobs_updated_at
  before update on image_generation_jobs
  for each row execute function set_image_generation_updated_at();

alter table generated_fashion_images enable row level security;
alter table image_generation_jobs enable row level security;

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
    now()
  )
  on conflict (entity_type, entity_id, variant, prompt_hash)
  do update set
    model = excluded.model,
    image_size = excluded.image_size,
    storage_path = excluded.storage_path,
    image_url = excluded.image_url,
    metadata = excluded.metadata,
    completed_at = excluded.completed_at;

  return finished_job;
end;
$$ language plpgsql security definer;

revoke all on function complete_image_generation_job(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function complete_image_generation_job(uuid, text, text, jsonb) to service_role;

create or replace function fail_image_generation_job(
  job_id uuid,
  failure_message text
)
returns image_generation_jobs as $$
declare
  failed_job image_generation_jobs;
begin
  update image_generation_jobs
  set
    status = case when attempts >= max_attempts then 'failed' else 'pending' end,
    locked_at = null,
    locked_by = null,
    error_message = left(failure_message, 2000)
  where id = job_id
  returning * into failed_job;

  if failed_job.id is null then
    raise exception 'Image generation job % not found', job_id;
  end if;

  return failed_job;
end;
$$ language plpgsql security definer;

revoke all on function fail_image_generation_job(uuid, text) from public, anon, authenticated;
grant execute on function fail_image_generation_job(uuid, text) to service_role;
