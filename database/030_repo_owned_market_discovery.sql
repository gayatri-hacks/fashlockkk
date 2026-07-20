-- Additive isolated market-discovery storage and styling access hardening.
-- Apply after 027, 028 and 029. No authoritative trend table is modified.

alter table trend_style_research_jobs
  add column if not exists selected_market_reasons jsonb not null default '{}',
  add column if not exists retry_after timestamptz;

create table if not exists trend_style_market_evidence (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references trend_style_concepts(id) on delete cascade,
  canonical_keyword text not null,
  market text not null check (market in ('IN','US','GB','FR','IT','DE','JP','KR','AU','BR','SG','AE')),
  normalized_interest numeric not null check (normalized_interest between 0 and 100),
  recent_momentum numeric not null check (recent_momentum between -100 and 100),
  confidence numeric not null check (confidence between 0 and 1),
  observation_completeness numeric not null check (observation_completeness between 0 and 1),
  provider text not null check (provider='google_trends_pytrends'),
  provider_timestamp timestamptz not null,
  retry_information jsonb not null default '{}',
  failure_reason text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(concept_id,market,provider)
);

create index if not exists trend_style_market_evidence_cache_idx
  on trend_style_market_evidence(concept_id,expires_at,provider_timestamp desc);

-- 029 introduced deferred image jobs. Keep the one-active-job-per-formula
-- invariant across the new deferred state without replacing the deployed index.
create unique index if not exists image_generation_jobs_formula_active_uidx
  on image_generation_jobs(formula_id)
  where formula_id is not null and status in ('pending','deferred','processing','completed');

alter table trend_style_market_evidence enable row level security;

-- Internal research data is service-role-only. Approved formula reads and
-- authenticated feedback retain their deliberately narrow public grants/policies.
revoke all on table trend_style_evidence from public,anon,authenticated;
revoke all on table trend_style_concepts from public,anon,authenticated;
revoke all on table trend_style_research_jobs from public,anon,authenticated;
revoke all on table trend_style_market_evidence from public,anon,authenticated;
revoke all on table trend_outfit_formulas from public,anon,authenticated;
revoke all on table trend_formula_feedback from public,anon,authenticated;

grant select,insert,update,delete on table trend_style_evidence to service_role;
grant select,insert,update,delete on table trend_style_concepts to service_role;
grant select,insert,update,delete on table trend_style_research_jobs to service_role;
grant select,insert,update,delete on table trend_style_market_evidence to service_role;
grant select,insert,update,delete on table trend_outfit_formulas to service_role;
grant select,insert,update,delete on table trend_formula_feedback to service_role;
grant select on table trend_outfit_formulas to anon,authenticated;
grant insert on table trend_formula_feedback to authenticated;

create or replace function claim_next_trend_style_research_job(worker_id text)
returns setof trend_style_research_jobs as $$
begin
  return query with next_job as (
    select id from trend_style_research_jobs
    where status='pending' and attempts < max_attempts
      and (retry_after is null or retry_after<=now())
    order by created_at for update skip locked limit 1
  ) update trend_style_research_jobs jobs
    set status='researching',attempts=jobs.attempts+1,updated_at=now(),error_message=null,retry_after=null
    from next_job where jobs.id=next_job.id returning jobs.*;
end;
$$ language plpgsql security definer set search_path=public;
revoke all on function claim_next_trend_style_research_job(text) from public,anon,authenticated;
grant execute on function claim_next_trend_style_research_job(text) to service_role;
