-- Additive quota deferral policy. Apply only after 027 and 028.
alter table image_generation_jobs add column if not exists retry_after timestamptz;
alter table image_generation_jobs add column if not exists deferred_provider text check (deferred_provider in ('cloudflare'));
alter table image_generation_jobs add column if not exists deferred_reason text check (deferred_reason in ('quota_exhausted'));
alter table image_generation_jobs drop constraint if exists image_generation_jobs_status_check;
alter table image_generation_jobs add constraint image_generation_jobs_status_check check (status in ('pending','deferred','processing','completed','failed','failed_review')) not valid;
alter table image_generation_jobs validate constraint image_generation_jobs_status_check;
create index if not exists image_generation_jobs_deferred_idx on image_generation_jobs(retry_after,created_at) where status='deferred';

create or replace function claim_next_image_generation_job_with_quota_policy(
  worker_id text,
  worker_provider text,
  allow_local_fallback boolean default false,
  desired_variant text default null,
  lock_timeout_minutes integer default 30
)
returns setof image_generation_jobs as $$
begin
  if worker_provider not in ('cloudflare','ollama') then raise exception 'Unsupported image worker provider'; end if;
  update image_generation_jobs set status=case when attempts>=max_attempts then 'failed' else 'pending' end,locked_at=null,locked_by=null,error_message=coalesce(error_message,'Worker lock expired') where status='processing' and locked_at<now()-make_interval(mins=>lock_timeout_minutes);
  return query with next_job as (
    select id from image_generation_jobs
    where attempts<max_attempts and (desired_variant is null or variant=desired_variant) and (
      status='pending' or
      (status='deferred' and deferred_provider='cloudflare' and worker_provider='cloudflare' and retry_after<=now()) or
      (status='deferred' and deferred_provider='cloudflare' and worker_provider='ollama' and allow_local_fallback=true)
    ) order by priority desc,created_at asc for update skip locked limit 1
  ) update image_generation_jobs jobs set status='processing',locked_at=now(),locked_by=worker_id,attempts=jobs.attempts+1,error_message=null,
    metadata=case when jobs.status='deferred' and worker_provider='ollama' then jobs.metadata||jsonb_build_object('localFallbackClaimed',true,'localFallbackWorker',worker_id) else jobs.metadata end
  from next_job where jobs.id=next_job.id returning jobs.*;
end;
$$ language plpgsql security definer set search_path=public;
revoke all on function claim_next_image_generation_job_with_quota_policy(text,text,boolean,text,integer) from public,anon,authenticated;
grant execute on function claim_next_image_generation_job_with_quota_policy(text,text,boolean,text,integer) to service_role;
