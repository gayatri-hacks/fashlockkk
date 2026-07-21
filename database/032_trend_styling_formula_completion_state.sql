-- Additive formula-completion state machine. Apply after migration 031.
-- Existing evidence, market selections, formulas, jobs and images are preserved.

alter table trend_style_research_jobs
  drop constraint if exists trend_style_research_jobs_status_check;
alter table trend_style_research_jobs
  add constraint trend_style_research_jobs_status_check check (status in (
    'pending','researching','evidence_ready','formula_generating','completed',
    'validating','images_pending','insufficient_evidence','failed'
  ));

create unique index if not exists trend_style_research_jobs_formula_active_uidx
  on trend_style_research_jobs(canonical_keyword,requesting_market,season,source_context)
  where status in ('pending','researching','evidence_ready','formula_generating','validating','images_pending');

create or replace function mark_trend_style_research_evidence_ready(
  target_job_id uuid,
  expected_claimed_attempts integer,
  selected text[],
  evaluated text[],
  selection_reasons jsonb,
  completed_evidence_hash text
)
returns uuid as $$
declare checkpoint_id uuid;
begin
  if cardinality(selected)<1 or cardinality(evaluated)<>12 or nullif(completed_evidence_hash,'') is null then
    raise exception 'Evidence checkpoint requires selected markets, all 12 evaluated markets and an evidence hash';
  end if;
  update trend_style_research_jobs
    set status='evidence_ready', selected_markets=selected, evaluated_markets=evaluated,
        selected_market_reasons=selection_reasons, evidence_hash=completed_evidence_hash,
        retry_after=null, error_message=null, completed_at=null, updated_at=now()
    where id=target_job_id and status='researching' and attempts=expected_claimed_attempts
    returning id into checkpoint_id;
  if checkpoint_id is null then raise exception 'Evidence checkpoint precondition failed'; end if;
  return checkpoint_id;
end;
$$ language plpgsql security definer set search_path=public;

create or replace function begin_trend_style_formula_generation(target_job_id uuid)
returns setof trend_style_research_jobs as $$
begin
  return query update trend_style_research_jobs jobs
    set status='formula_generating',retry_after=null,error_message=null,updated_at=now()
    where jobs.id=target_job_id and jobs.status='evidence_ready'
      and jobs.evidence_hash is not null and cardinality(jobs.selected_markets)>0
      and cardinality(jobs.evaluated_markets)=12
      and (jobs.retry_after is null or jobs.retry_after<=now())
    returning jobs.*;
end;
$$ language plpgsql security definer set search_path=public;

create or replace function defer_trend_style_formula_quota(
  target_job_id uuid,
  retry_at timestamptz,
  safe_error_message text
)
returns uuid as $$
declare deferred_id uuid;
begin
  if retry_at<now()+interval '5 minutes' or retry_at>now()+interval '25 hours' then
    raise exception 'Formula retry window must be between 5 minutes and 25 hours';
  end if;
  update trend_style_research_jobs
    set status='evidence_ready',retry_after=retry_at,
        error_message=left(coalesce(safe_error_message,'Formula provider quota exhausted'),240),updated_at=now()
    where id=target_job_id and status='formula_generating'
    returning id into deferred_id;
  if deferred_id is null then raise exception 'Formula quota deferral precondition failed'; end if;
  return deferred_id;
end;
$$ language plpgsql security definer set search_path=public;

create or replace function return_trend_style_formula_to_evidence_ready(
  target_job_id uuid,
  safe_error_message text
)
returns uuid as $$
declare returned_id uuid;
begin
  update trend_style_research_jobs
    set status='evidence_ready',retry_after=null,
        error_message=left(coalesce(safe_error_message,'Formula generation or validation failed'),240),updated_at=now()
    where id=target_job_id and status='formula_generating'
    returning id into returned_id;
  if returned_id is null then raise exception 'Formula state return precondition failed'; end if;
  return returned_id;
end;
$$ language plpgsql security definer set search_path=public;

create or replace function approve_trend_formula_set_and_complete_job(
  candidate_set_id uuid,
  target_job_id uuid
)
returns uuid as $$
declare job_row trend_style_research_jobs%rowtype;
declare formula_count integer;
declare approved_count integer;
declare audience_count integer;
declare slot_count integer;
declare matrix_count integer;
declare formula_evidence_hash text;
begin
  select * into job_row from trend_style_research_jobs where id=target_job_id for update;
  if job_row.id is null or job_row.status<>'formula_generating' then
    raise exception 'Formula completion requires a formula_generating job';
  end if;
  perform 1 from trend_outfit_formulas where set_id=candidate_set_id and review_status='pending_review' for update;
  select count(*),count(distinct audience),count(distinct formula_slot),
         count(distinct audience||':'||formula_slot),min(evidence_hash)
    into formula_count,audience_count,slot_count,matrix_count,formula_evidence_hash
    from trend_outfit_formulas
    where set_id=candidate_set_id and review_status='pending_review';
  if formula_count<>6 or audience_count<>2 or slot_count<>3 or matrix_count<>6 then
    raise exception 'Candidate formula set must contain exact 2x3 matrix for the job concept';
  end if;
  if exists (
    select 1 from trend_outfit_formulas where set_id=candidate_set_id
      and (concept_id is distinct from job_row.concept_id or trend_id is not null)
  ) then raise exception 'Every candidate formula must belong to the checkpoint concept'; end if;
  if formula_evidence_hash is distinct from job_row.evidence_hash or exists (
    select 1 from trend_outfit_formulas where set_id=candidate_set_id and evidence_hash<>job_row.evidence_hash
  ) then raise exception 'Formula evidence hash does not match the job checkpoint'; end if;

  update trend_outfit_formulas set review_status='superseded'
    where review_status='approved' and concept_id=job_row.concept_id and set_id<>candidate_set_id;
  update trend_outfit_formulas set review_status='approved',updated_at=now()
    where set_id=candidate_set_id and concept_id=job_row.concept_id and review_status='pending_review';
  select count(*) into approved_count from trend_outfit_formulas
    where set_id=candidate_set_id and concept_id=job_row.concept_id and review_status='approved';
  if approved_count<>6 then raise exception 'Approved formula read-back must contain exactly six rows'; end if;

  update trend_style_research_jobs
    set status='completed',retry_after=null,error_message=null,completed_at=now(),updated_at=now()
    where id=target_job_id and status='formula_generating';
  return target_job_id;
end;
$$ language plpgsql security definer set search_path=public;

create or replace function resume_exact_linen_formula_job(
  production_confirmation text
)
returns uuid as $$
declare resumed_id uuid;
begin
  if production_confirmation<>'CONFIRM_PRODUCTION_LINEN_FORMULA_ONLY_RESUME' then
    raise exception 'Explicit production linen formula-only confirmation is required';
  end if;
  update trend_style_research_jobs jobs
    set status='evidence_ready',retry_after=null,error_message='False completion released for formula-only resume',
        completed_at=null,updated_at=now()
    where jobs.id='2e0ef127-73cb-5bc6-8707-2d6305719e8c'::uuid
      and jobs.concept_id='37905936-ba71-5ea7-b0b9-72c3856527a7'::uuid
      and jobs.status='completed' and jobs.evidence_hash is not null
      and cardinality(jobs.selected_markets)>0 and cardinality(jobs.evaluated_markets)=12
      and exists (select 1 from trend_style_evidence evidence where evidence.concept_id=jobs.concept_id)
      and not exists (select 1 from trend_outfit_formulas formulas where formulas.concept_id=jobs.concept_id and formulas.review_status='approved')
    returning jobs.id into resumed_id;
  if resumed_id is null then raise exception 'Exact linen formula-only resume precondition failed'; end if;
  return resumed_id;
end;
$$ language plpgsql security definer set search_path=public;

revoke all on function mark_trend_style_research_evidence_ready(uuid,integer,text[],text[],jsonb,text) from public,anon,authenticated;
revoke all on function begin_trend_style_formula_generation(uuid) from public,anon,authenticated;
revoke all on function defer_trend_style_formula_quota(uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function return_trend_style_formula_to_evidence_ready(uuid,text) from public,anon,authenticated;
revoke all on function approve_trend_formula_set_and_complete_job(uuid,uuid) from public,anon,authenticated;
revoke all on function resume_exact_linen_formula_job(text) from public,anon,authenticated;
grant execute on function mark_trend_style_research_evidence_ready(uuid,integer,text[],text[],jsonb,text) to service_role;
grant execute on function begin_trend_style_formula_generation(uuid) to service_role;
grant execute on function defer_trend_style_formula_quota(uuid,timestamptz,text) to service_role;
grant execute on function return_trend_style_formula_to_evidence_ready(uuid,text) to service_role;
grant execute on function approve_trend_formula_set_and_complete_job(uuid,uuid) to service_role;
grant execute on function resume_exact_linen_formula_job(text) to service_role;
