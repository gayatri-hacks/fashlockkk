-- Additive reliability controls for styling market discovery.
-- Apply after 030. This migration never writes authoritative trend tables.

create table if not exists trend_style_market_discovery_failures (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references trend_style_research_jobs(id) on delete cascade,
  concept_id uuid not null references trend_style_concepts(id) on delete cascade,
  canonical_keyword text not null,
  market text not null check (market in ('IN','US','GB','FR','IT','DE','JP','KR','AU','BR','SG','AE')),
  provider text not null check (provider='google_trends_pytrends'),
  error_category text not null check (error_category in ('quota_or_rate_limit','market_unavailable')),
  failure_reason text not null check (char_length(failure_reason) between 1 and 240),
  retry_after timestamptz,
  provider_timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists trend_style_market_discovery_failures_job_idx
  on trend_style_market_discovery_failures(job_id,created_at desc);
create index if not exists trend_style_market_discovery_failures_retry_idx
  on trend_style_market_discovery_failures(retry_after)
  where retry_after is not null;

alter table trend_style_market_discovery_failures enable row level security;
revoke all on table trend_style_market_discovery_failures from public,anon,authenticated;
grant select,insert,update,delete on table trend_style_market_discovery_failures to service_role;

create or replace function defer_trend_style_research_job_quota(
  target_job_id uuid,
  expected_claimed_attempts integer,
  retry_at timestamptz,
  safe_error_message text
)
returns uuid as $$
declare
  deferred_job_id uuid;
begin
  if expected_claimed_attempts<1 then
    raise exception 'Expected claimed attempts must be positive';
  end if;
  if retry_at<now()+interval '5 hours' or retry_at>now()+interval '25 hours' then
    raise exception 'Quota retry window must be between 5 and 25 hours';
  end if;
  update trend_style_research_jobs
    set status='pending',
        attempts=attempts-1,
        retry_after=retry_at,
        error_message=left(coalesce(safe_error_message,'Google Trends quota deferral'),240),
        updated_at=now()
    where id=target_job_id
      and status='researching'
      and attempts=expected_claimed_attempts
      and attempts>0
    returning id into deferred_job_id;
  if deferred_job_id is null then
    raise exception 'Research job quota deferral precondition failed';
  end if;
  return deferred_job_id;
end;
$$ language plpgsql security definer set search_path=public;
revoke all on function defer_trend_style_research_job_quota(uuid,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function defer_trend_style_research_job_quota(uuid,integer,timestamptz,text) to service_role;

create or replace function recover_trend_style_research_job_attempt(
  target_job_id uuid,
  expected_concept_id uuid,
  expected_attempts integer,
  production_confirmation text
)
returns uuid as $$
declare
  recovered_job_id uuid;
begin
  if production_confirmation<>'CONFIRM_PRODUCTION_STYLING_JOB_RECOVERY' then
    raise exception 'Explicit production recovery confirmation is required';
  end if;
  if expected_attempts<1 then
    raise exception 'Expected attempts must be positive';
  end if;
  update trend_style_research_jobs
    set attempts=attempts-1,
        retry_after=null,
        error_message='One provider-failed attempt released after controlled recovery',
        updated_at=now()
    where id=target_job_id
      and concept_id=expected_concept_id
      and status='pending'
      and attempts=expected_attempts
      and attempts>0
    returning id into recovered_job_id;
  if recovered_job_id is null then
    raise exception 'Research job recovery precondition failed';
  end if;
  return recovered_job_id;
end;
$$ language plpgsql security definer set search_path=public;
revoke all on function recover_trend_style_research_job_attempt(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function recover_trend_style_research_job_attempt(uuid,uuid,integer,text) to service_role;
