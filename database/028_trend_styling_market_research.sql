-- Additive market-research extension. Does not modify canonical trend records.
alter table trend_style_evidence add column if not exists published_at timestamptz;
alter table trend_style_evidence add column if not exists source_language text;
alter table trend_style_evidence add column if not exists content_fingerprint text;
create unique index if not exists trend_style_evidence_fingerprint_uidx on trend_style_evidence(content_fingerprint) where content_fingerprint is not null;

create table if not exists trend_style_concepts (
  id uuid primary key, canonical_keyword text not null unique, source_context text not null check (source_context='user_search'), created_at timestamptz not null default now()
);
alter table trend_style_evidence alter column trend_id drop not null;
alter table trend_style_evidence add column if not exists concept_id uuid references trend_style_concepts(id) on delete cascade;
alter table trend_style_evidence add column if not exists market_relevance_score numeric check (market_relevance_score between 0 and 1);
alter table trend_style_evidence add constraint trend_style_evidence_owner_check check ((trend_id is not null) <> (concept_id is not null)) not valid;
alter table trend_style_evidence validate constraint trend_style_evidence_owner_check;

create table if not exists trend_style_research_jobs (
  id uuid primary key default gen_random_uuid(),
  canonical_keyword text not null,
  concept_id uuid not null references trend_style_concepts(id) on delete cascade,
  requesting_market text not null,
  audience_scope text[] not null default array['women','men'],
  selected_markets text[] not null default '{}',
  evaluated_markets text[] not null default '{}',
  season text not null,
  status text not null default 'pending' check (status in ('pending','researching','validating','images_pending','completed','insufficient_evidence','failed')),
  evidence_hash text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  source_context text not null check (source_context in ('canonical_trend','user_search')),
  error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create unique index if not exists trend_style_research_jobs_active_uidx on trend_style_research_jobs(canonical_keyword,requesting_market,season,source_context) where status in ('pending','researching','validating','images_pending');
create index if not exists trend_style_research_jobs_queue_idx on trend_style_research_jobs(created_at) where status='pending';
alter table trend_style_research_jobs enable row level security;
alter table trend_style_concepts enable row level security;

alter table trend_outfit_formulas alter column trend_id drop not null;
alter table trend_outfit_formulas add column if not exists concept_id uuid references trend_style_concepts(id) on delete cascade;
alter table trend_outfit_formulas add column if not exists set_id uuid;
alter table trend_outfit_formulas add constraint trend_outfit_formula_owner_check check ((trend_id is not null) <> (concept_id is not null)) not valid;
alter table trend_outfit_formulas validate constraint trend_outfit_formula_owner_check;
create unique index if not exists trend_outfit_formulas_approved_set_slot_uidx on trend_outfit_formulas(set_id,audience,formula_slot) where review_status='approved';

alter table generated_fashion_images add column if not exists formula_id uuid references trend_outfit_formulas(id) on delete set null;
create unique index if not exists generated_fashion_images_formula_uidx on generated_fashion_images(formula_id) where formula_id is not null;
alter table image_generation_jobs add column if not exists formula_id uuid references trend_outfit_formulas(id) on delete cascade;
alter table image_generation_jobs alter column entity_id drop not null;
alter table generated_fashion_images alter column entity_id drop not null;
create unique index if not exists image_generation_jobs_formula_uidx on image_generation_jobs(formula_id) where formula_id is not null and status in ('pending','processing','completed');
create or replace function set_generated_formula_identity() returns trigger as $$ begin
  if new.variant in ('trend_formula_women','trend_formula_men') then new.formula_id = nullif(new.metadata->>'formulaId','')::uuid; end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists generated_formula_identity on generated_fashion_images;
create trigger generated_formula_identity before insert or update on generated_fashion_images for each row execute function set_generated_formula_identity();

create or replace function approve_trend_formula_set(candidate_set_id uuid) returns uuid as $$
declare owner_trend bigint; owner_concept uuid; formula_count integer; audience_count integer; slot_count integer; matrix_count integer;
begin
  perform 1 from trend_outfit_formulas where set_id=candidate_set_id and review_status='pending_review' for update;
  select trend_id,concept_id into owner_trend,owner_concept from trend_outfit_formulas where set_id=candidate_set_id limit 1;
  select count(*),count(distinct audience),count(distinct formula_slot),count(distinct audience||':'||formula_slot) into formula_count,audience_count,slot_count,matrix_count from trend_outfit_formulas where set_id=candidate_set_id and review_status='pending_review';
  if formula_count<>6 or audience_count<>2 or slot_count<>3 or matrix_count<>6 then raise exception 'Candidate formula set must contain exact 2x3 matrix'; end if;
  update trend_outfit_formulas set review_status='superseded' where review_status='approved' and set_id<>candidate_set_id and ((owner_trend is not null and trend_id=owner_trend) or (owner_concept is not null and concept_id=owner_concept));
  update trend_outfit_formulas set review_status='approved',updated_at=now() where set_id=candidate_set_id and review_status='pending_review';
  return candidate_set_id;
end; $$ language plpgsql security definer set search_path=public;
revoke all on function approve_trend_formula_set(uuid) from public,anon,authenticated;
grant execute on function approve_trend_formula_set(uuid) to service_role;

create or replace function claim_next_trend_style_research_job(worker_id text)
returns setof trend_style_research_jobs as $$
begin
  return query with next_job as (
    select id from trend_style_research_jobs where status='pending' and attempts < max_attempts order by created_at for update skip locked limit 1
  ) update trend_style_research_jobs jobs set status='researching', attempts=jobs.attempts+1, updated_at=now(), error_message=null
    from next_job where jobs.id=next_job.id returning jobs.*;
end;
$$ language plpgsql security definer set search_path=public;
revoke all on function claim_next_trend_style_research_job(text) from public, anon, authenticated;
grant execute on function claim_next_trend_style_research_job(text) to service_role;
