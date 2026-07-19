-- Lock down internal trend_concept review data and add a variant-scoped queue claim RPC.
-- Apply after:
-- 024_trend_concept_image_review.sql
-- 025_trend_concept_pixel_validation.sql

alter table trend_concept_image_reviews enable row level security;
alter table trend_concept_image_candidates enable row level security;

drop policy if exists "trend concept image reviews are readable" on trend_concept_image_reviews;
drop policy if exists "trend concept image candidates are readable" on trend_concept_image_candidates;

drop policy if exists "service role can read trend concept image reviews" on trend_concept_image_reviews;
drop policy if exists "service role can insert trend concept image reviews" on trend_concept_image_reviews;
drop policy if exists "service role can update trend concept image reviews" on trend_concept_image_reviews;
drop policy if exists "service role can read trend concept image candidates" on trend_concept_image_candidates;
drop policy if exists "service role can insert trend concept image candidates" on trend_concept_image_candidates;
drop policy if exists "service role can update trend concept image candidates" on trend_concept_image_candidates;

revoke all on table trend_concept_image_reviews from public, anon, authenticated;
revoke all on table trend_concept_image_candidates from public, anon, authenticated;

grant select, insert, update on table trend_concept_image_reviews to service_role;
grant select, insert, update on table trend_concept_image_candidates to service_role;

create policy "service role can read trend concept image reviews"
  on trend_concept_image_reviews
  for select
  to service_role
  using (true);

create policy "service role can insert trend concept image reviews"
  on trend_concept_image_reviews
  for insert
  to service_role
  with check (true);

create policy "service role can update trend concept image reviews"
  on trend_concept_image_reviews
  for update
  to service_role
  using (true)
  with check (true);

create policy "service role can read trend concept image candidates"
  on trend_concept_image_candidates
  for select
  to service_role
  using (true);

create policy "service role can insert trend concept image candidates"
  on trend_concept_image_candidates
  for insert
  to service_role
  with check (true);

create policy "service role can update trend concept image candidates"
  on trend_concept_image_candidates
  for update
  to service_role
  using (true)
  with check (true);

create or replace function claim_next_image_generation_job_for_variant(
  worker_id text,
  desired_variant text,
  lock_timeout_minutes integer default 30
)
returns setof image_generation_jobs as $$
begin
  if desired_variant not in ('trend_concept', 'trend_hero', 'trend_women', 'trend_men', 'deep_dive', 'daily_edit') then
    raise exception 'Unsupported image generation variant: %', desired_variant
      using errcode = '22023';
  end if;

  update image_generation_jobs
  set
    status = case when attempts >= max_attempts then 'failed' else 'pending' end,
    locked_at = null,
    locked_by = null,
    error_message = coalesce(error_message, 'Worker lock expired')
  where status = 'processing'
    and variant = desired_variant
    and locked_at < now() - make_interval(mins => lock_timeout_minutes);

  return query
  with next_job as (
    select id
    from image_generation_jobs
    where status = 'pending'
      and variant = desired_variant
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

revoke all on function claim_next_image_generation_job_for_variant(text, text, integer) from public, anon, authenticated;
grant execute on function claim_next_image_generation_job_for_variant(text, text, integer) to service_role;
