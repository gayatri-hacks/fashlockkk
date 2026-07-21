-- Consolidated, read-only verification for styling migrations 027-031.
-- One statement intentionally returns every check plus one aggregate summary row.

with checks(phase,check_name,passed,details) as (
  select '027_prerequisite','base image tables exist',
    to_regclass('public.generated_fashion_images') is not null
      and to_regclass('public.image_generation_jobs') is not null,
    'generated_fashion_images and image_generation_jobs are required'::text

  union all select '027_prerequisite','required base extensions and auth schema exist',
    exists(select 1 from pg_extension where extname='pgcrypto')
      and to_regclass('auth.users') is not null,
    'requires pgcrypto and auth.users'

  union all select '027_prerequisite','required base image columns exist',
    not exists (
      select 1 from (values
        ('generated_fashion_images','id'),('generated_fashion_images','entity_id'),('generated_fashion_images','variant'),('generated_fashion_images','metadata'),
        ('image_generation_jobs','id'),('image_generation_jobs','entity_id'),('image_generation_jobs','variant'),('image_generation_jobs','status'),('image_generation_jobs','metadata')
      ) expected(table_name,column_name)
      where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=expected.table_name and c.column_name=expected.column_name)
    ),
    'base IDs, variants, status and metadata columns'

  union all select '027','styling intelligence tables exist',
    to_regclass('public.trend_style_evidence') is not null
      and to_regclass('public.trend_outfit_formulas') is not null
      and to_regclass('public.trend_formula_feedback') is not null,
    'trend_style_evidence, trend_outfit_formulas, trend_formula_feedback'

  union all select '027','styling intelligence columns exist',
    not exists (
      select 1 from (values
        ('trend_style_evidence','trend_id'),('trend_style_evidence','canonical_keyword'),('trend_style_evidence','audience'),('trend_style_evidence','region'),('trend_style_evidence','observed_at'),('trend_style_evidence','quality_score'),('trend_style_evidence','recency_score'),
        ('trend_outfit_formulas','trend_id'),('trend_outfit_formulas','canonical_keyword'),('trend_outfit_formulas','audience'),('trend_outfit_formulas','formula_slot'),('trend_outfit_formulas','evidence_hash'),('trend_outfit_formulas','formula_hash'),('trend_outfit_formulas','review_status'),
        ('trend_formula_feedback','formula_id'),('trend_formula_feedback','user_id'),('trend_formula_feedback','action')
      ) expected(table_name,column_name)
      where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=expected.table_name and c.column_name=expected.column_name)
    ),
    'evidence, formula identity/hash/review, and feedback columns'

  union all select '027','styling intelligence constraints exist',
    not exists (
      select 1 from (values
        ('trend_style_evidence_audience_check'),('trend_style_evidence_quality_score_check'),('trend_style_evidence_recency_score_check'),
        ('trend_outfit_formulas_audience_check'),('trend_outfit_formulas_formula_slot_check'),('trend_outfit_formulas_confidence_check'),('trend_outfit_formulas_review_status_check'),
        ('trend_formula_feedback_action_check'),('trend_formula_feedback_check')
      ) expected(constraint_name)
      where not exists(select 1 from pg_constraint c where c.connamespace='public'::regnamespace and c.conname=expected.constraint_name)
    ),
    'audience, score, slot, review-status and feedback checks'

  union all select '027','styling intelligence indexes exist',
    not exists (
      select 1 from (values
        ('trend_style_evidence_lookup_idx',false),('trend_outfit_formulas_hash_uidx',true),
        ('trend_outfit_formulas_approved_slot_uidx',true),('trend_outfit_formulas_read_idx',false),
        ('trend_formula_feedback_formula_idx',false)
      ) expected(index_name,must_be_unique)
      where not exists(
        select 1 from pg_indexes i where i.schemaname='public' and i.indexname=expected.index_name
          and (not expected.must_be_unique or i.indexdef ilike '%unique%')
      )
    ),
    'evidence lookup, formula hash/approved-slot uniqueness, read and feedback indexes'

  union all select '028_prerequisite','migration 027 objects required by 028 exist',
    to_regclass('public.trend_style_evidence') is not null
      and to_regclass('public.trend_outfit_formulas') is not null
      and to_regclass('public.generated_fashion_images') is not null
      and to_regclass('public.image_generation_jobs') is not null,
    '027 styling tables plus image tables'

  union all select '028','isolated research tables exist',
    to_regclass('public.trend_style_concepts') is not null
      and to_regclass('public.trend_style_research_jobs') is not null,
    'trend_style_concepts and trend_style_research_jobs'

  union all select '028','isolated research and formula-image columns exist',
    not exists (
      select 1 from (values
        ('trend_style_evidence','concept_id'),('trend_style_evidence','published_at'),('trend_style_evidence','source_language'),('trend_style_evidence','content_fingerprint'),('trend_style_evidence','market_relevance_score'),
        ('trend_outfit_formulas','concept_id'),('trend_outfit_formulas','set_id'),
        ('trend_style_research_jobs','concept_id'),('trend_style_research_jobs','selected_markets'),('trend_style_research_jobs','evaluated_markets'),('trend_style_research_jobs','status'),('trend_style_research_jobs','attempts'),('trend_style_research_jobs','max_attempts'),
        ('generated_fashion_images','formula_id'),('image_generation_jobs','formula_id')
      ) expected(table_name,column_name)
      where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=expected.table_name and c.column_name=expected.column_name)
    ),
    'concept ownership, research queue, evidence metadata and formula image identity'

  union all select '028','isolated ownership constraints exist',
    not exists (
      select 1 from (values ('trend_style_evidence_owner_check'),('trend_outfit_formula_owner_check')) expected(constraint_name)
      where not exists(select 1 from pg_constraint c where c.connamespace='public'::regnamespace and c.conname=expected.constraint_name)
    ),
    'exactly one trend_id or concept_id owner'

  union all select '028','formula and six-image uniqueness indexes exist',
    not exists (
      select 1 from (values
        ('trend_style_evidence_fingerprint_uidx',true),('trend_style_research_jobs_active_uidx',true),('trend_style_research_jobs_queue_idx',false),
        ('trend_outfit_formulas_approved_set_slot_uidx',true),('generated_fashion_images_formula_uidx',true),('image_generation_jobs_formula_uidx',true)
      ) expected(index_name,must_be_unique)
      where not exists(
        select 1 from pg_indexes i where i.schemaname='public' and i.indexname=expected.index_name
          and (not expected.must_be_unique or i.indexdef ilike '%unique%')
      )
    ),
    'fingerprint, active queue, approved 2x3 set and per-formula image uniqueness'

  union all select '028','styling RPCs exist',
    to_regprocedure('public.approve_trend_formula_set(uuid)') is not null
      and to_regprocedure('public.claim_next_trend_style_research_job(text)') is not null,
    'approve_trend_formula_set(uuid), claim_next_trend_style_research_job(text)'

  union all select '028','formula-set approval is atomic and requires exact 2x3 matrix',
    coalesce(
      regexp_replace(pg_get_functiondef(to_regprocedure('public.approve_trend_formula_set(uuid)')),'\s+','','g')
        ilike '%formula_count<>6oraudience_count<>2orslot_count<>3ormatrix_count<>6%'
      and regexp_replace(pg_get_functiondef(to_regprocedure('public.approve_trend_formula_set(uuid)')),'\s+','','g')
        ilike '%review_status=''superseded''%review_status=''approved''%',
      false
    ),
    'one locked candidate set; six unique audience/slot formulas; supersede then approve'

  union all select '028','six formula images have unique database identities',
    exists(select 1 from pg_indexes i where i.schemaname='public' and i.indexname='generated_fashion_images_formula_uidx' and i.indexdef ilike '%unique%')
      and exists(select 1 from pg_indexes i where i.schemaname='public' and i.indexname='image_generation_jobs_formula_uidx' and i.indexdef ilike '%unique%')
      and not exists(select formula_id from generated_fashion_images where formula_id is not null group by formula_id having count(*)>1),
    'unique formula_id in published images and active image jobs'

  union all select 'compatibility','existing image variants and statuses are compatible',
    not exists(select 1 from generated_fashion_images where variant not in ('trend_concept','trend_hero','trend_women','trend_men','deep_dive','daily_edit','trend_formula_women','trend_formula_men'))
      and not exists(select 1 from image_generation_jobs where variant not in ('trend_concept','trend_hero','trend_women','trend_men','deep_dive','daily_edit','trend_formula_women','trend_formula_men'))
      and not exists(select 1 from image_generation_jobs where status not in ('pending','deferred','processing','completed','failed','failed_review')),
    'all existing rows fit the 027-029 variant and status constraints'

  union all select '029_prerequisite','image job table required by quota migration exists',
    to_regclass('public.image_generation_jobs') is not null,
    'image_generation_jobs'

  union all select '029','quota deferral columns and constraints exist',
    not exists (
      select 1 from (values ('retry_after'),('deferred_provider'),('deferred_reason')) expected(column_name)
      where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='image_generation_jobs' and c.column_name=expected.column_name)
    )
      and exists(select 1 from pg_constraint c where c.connamespace='public'::regnamespace and c.conname='image_generation_jobs_deferred_provider_check')
      and exists(select 1 from pg_constraint c where c.connamespace='public'::regnamespace and c.conname='image_generation_jobs_deferred_reason_check')
      and exists(select 1 from pg_constraint c where c.connamespace='public'::regnamespace and c.conname='image_generation_jobs_status_check' and pg_get_constraintdef(c.oid) ilike '%deferred%'),
    'retry_after, cloudflare provider, quota_exhausted reason and deferred status'

  union all select '029','quota deferral index exists',
    exists(select 1 from pg_indexes i where i.schemaname='public' and i.indexname='image_generation_jobs_deferred_idx'),
    'image_generation_jobs_deferred_idx'

  union all select '029','quota-aware image claim RPC exists and enforces fallback policy',
    to_regprocedure('public.claim_next_image_generation_job_with_quota_policy(text,text,boolean,text,integer)') is not null
      and coalesce(
        regexp_replace(pg_get_functiondef(to_regprocedure('public.claim_next_image_generation_job_with_quota_policy(text,text,boolean,text,integer)')),'\s+','','g')
          ilike '%retry_after<=now()%worker_provider=''ollama''andallow_local_fallback=true%',
        false
      ),
    'Cloudflare waits for retry_after; Ollama requires allow_local_fallback=true'

  union all select '030_prerequisite','deployed 027-029 objects required by 030 exist',
    to_regclass('public.trend_style_research_jobs') is not null
      and to_regclass('public.trend_style_concepts') is not null
      and to_regclass('public.image_generation_jobs') is not null
      and to_regprocedure('public.claim_next_trend_style_research_job(text)') is not null,
    'research queue, isolated concepts, image jobs and research claim RPC'

  union all select '030','market evidence table and research retry columns exist',
    to_regclass('public.trend_style_market_evidence') is not null
      and not exists (
        select 1 from (values
          ('trend_style_market_evidence','concept_id'),('trend_style_market_evidence','canonical_keyword'),('trend_style_market_evidence','market'),
          ('trend_style_market_evidence','normalized_interest'),('trend_style_market_evidence','recent_momentum'),('trend_style_market_evidence','confidence'),
          ('trend_style_market_evidence','observation_completeness'),('trend_style_market_evidence','provider'),('trend_style_market_evidence','provider_timestamp'),
          ('trend_style_market_evidence','retry_information'),('trend_style_market_evidence','failure_reason'),('trend_style_market_evidence','expires_at'),
          ('trend_style_research_jobs','selected_market_reasons'),('trend_style_research_jobs','retry_after')
        ) expected(table_name,column_name)
        where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=expected.table_name and c.column_name=expected.column_name)
      ),
    '12-market evidence metrics, provider/retry/failure data, selection reasons and job retry_after'

  union all select '030','market evidence constraints exist',
    not exists (
      select 1 from (values
        ('trend_style_market_evidence_market_check'),('trend_style_market_evidence_normalized_interest_check'),
        ('trend_style_market_evidence_recent_momentum_check'),('trend_style_market_evidence_confidence_check'),
        ('trend_style_market_evidence_observation_completeness_check'),('trend_style_market_evidence_provider_check'),
        ('trend_style_market_evidence_concept_id_market_provider_key')
      ) expected(constraint_name)
      where not exists(select 1 from pg_constraint c where c.connamespace='public'::regnamespace and c.conname=expected.constraint_name)
    ),
    'market, bounded scores, provider and concept/market/provider uniqueness'

  union all select '030','market cache and deferred formula-job uniqueness indexes exist',
    exists(select 1 from pg_indexes i where i.schemaname='public' and i.indexname='trend_style_market_evidence_cache_idx')
      and exists(select 1 from pg_indexes i where i.schemaname='public' and i.indexname='image_generation_jobs_formula_active_uidx' and i.indexdef ilike '%unique%' and i.indexdef ilike '%deferred%')
      and not exists(
        select formula_id from image_generation_jobs
        where formula_id is not null and status in ('pending','deferred','processing','completed')
        group by formula_id having count(*)>1
      ),
    'fresh market cache lookup and one active/deferred job per formula'

  union all select '030','research claim RPC respects retry_after',
    coalesce(
      regexp_replace(pg_get_functiondef(to_regprocedure('public.claim_next_trend_style_research_job(text)')),'\s+','','g')
        ilike '%retry_afterisnullorretry_after<=now()%',
      false
    ),
    'pending research jobs cannot be reclaimed before retry_after'

  union all select '031_prerequisite','deployed research queue and market evidence required by reliability migration exist',
    to_regclass('public.trend_style_research_jobs') is not null
      and to_regclass('public.trend_style_concepts') is not null
      and to_regclass('public.trend_style_market_evidence') is not null,
    '030 research queue, isolated concepts and market evidence'

  union all select '031','market discovery failure diagnostics table and columns exist',
    to_regclass('public.trend_style_market_discovery_failures') is not null
      and not exists (
        select 1 from (values
          ('job_id'),('concept_id'),('canonical_keyword'),('market'),('provider'),('error_category'),
          ('failure_reason'),('retry_after'),('provider_timestamp'),('created_at')
        ) expected(column_name)
        where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='trend_style_market_discovery_failures' and c.column_name=expected.column_name)
      ),
    'separate bounded diagnostics retain job/concept/market/provider/retry context'

  union all select '031','market discovery failure constraints and indexes exist',
    not exists (
      select 1 from (values
        ('trend_style_market_discovery_failures_market_check'),
        ('trend_style_market_discovery_failures_provider_check'),
        ('trend_style_market_discovery_failures_error_category_check'),
        ('trend_style_market_discovery_failures_failure_reason_check')
      ) expected(constraint_name)
      where not exists(select 1 from pg_constraint c where c.connamespace='public'::regnamespace and c.conname=expected.constraint_name)
    )
      and exists(select 1 from pg_indexes i where i.schemaname='public' and i.indexname='trend_style_market_discovery_failures_job_idx')
      and exists(select 1 from pg_indexes i where i.schemaname='public' and i.indexname='trend_style_market_discovery_failures_retry_idx'),
    'bounded market/provider/category/reason plus job and retry indexes'

  union all select '031','quota deferral RPC is atomic and releases the claimed attempt',
    to_regprocedure('public.defer_trend_style_research_job_quota(uuid,integer,timestamptz,text)') is not null
      and coalesce(
        regexp_replace(pg_get_functiondef(to_regprocedure('public.defer_trend_style_research_job_quota(uuid,integer,timestamptz,text)')),'\s+','','g')
          ilike '%status=''pending''%attempts=attempts-1%retry_after=retry_at%status=''researching''%attempts=expected_claimed_attempts%',
        false
      ),
    'only the exactly claimed job is deferred and its claim increment is atomically released'

  union all select '031','controlled recovery RPC requires exact job state, concept and confirmation',
    to_regprocedure('public.recover_trend_style_research_job_attempt(uuid,uuid,integer,text)') is not null
      and coalesce(
        regexp_replace(pg_get_functiondef(to_regprocedure('public.recover_trend_style_research_job_attempt(uuid,uuid,integer,text)')),'\s+','','g')
          ilike '%CONFIRM_PRODUCTION_STYLING_JOB_RECOVERY%id=target_job_id%concept_id=expected_concept_id%status=''pending''%attempts=expected_attempts%',
        false
      ),
    'recovery only releases one matching pending attempt and does not delete concept, evidence or formulas'

  union all select '032_prerequisite','formula completion state migration prerequisites exist',
    to_regclass('public.trend_style_research_jobs') is not null
      and to_regclass('public.trend_style_evidence') is not null
      and to_regclass('public.trend_outfit_formulas') is not null,
    'research jobs, saved evidence and formulas from 027-031'

  union all select '032','job status constraint retains legacy states and adds formula states',
    exists(
      select 1 from pg_constraint c
      where c.connamespace='public'::regnamespace and c.conname='trend_style_research_jobs_status_check'
        and pg_get_constraintdef(c.oid) ilike all(array[
          '%pending%','%researching%','%validating%','%images_pending%','%completed%',
          '%insufficient_evidence%','%failed%','%evidence_ready%','%formula_generating%'
        ])
    ) and exists(select 1 from pg_indexes where schemaname='public' and indexname='trend_style_research_jobs_formula_active_uidx' and indexdef ilike '%evidence_ready%' and indexdef ilike '%formula_generating%'),
    'all deployed statuses remain valid and active formula states retain uniqueness'

  union all select '032','evidence checkpoint and formula claim RPCs enforce ordered transitions',
    coalesce(regexp_replace(pg_get_functiondef(to_regprocedure('public.mark_trend_style_research_evidence_ready(uuid,integer,text[],text[],jsonb,text)')),'\s+','','g') ilike '%status=''evidence_ready''%status=''researching''%attempts=expected_claimed_attempts%',false)
      and coalesce(regexp_replace(pg_get_functiondef(to_regprocedure('public.begin_trend_style_formula_generation(uuid)')),'\s+','','g') ilike '%status=''formula_generating''%status=''evidence_ready''%retry_after%',false),
    'research checkpoints evidence; due evidence-ready jobs alone claim formula generation'

  union all select '032','formula quota and non-quota failures return to evidence_ready',
    coalesce(regexp_replace(pg_get_functiondef(to_regprocedure('public.defer_trend_style_formula_quota(uuid,timestamptz,text)')),'\s+','','g') ilike '%status=''evidence_ready''%retry_after=retry_at%status=''formula_generating''%',false)
      and coalesce(regexp_replace(pg_get_functiondef(to_regprocedure('public.return_trend_style_formula_to_evidence_ready(uuid,text)')),'\s+','','g') ilike '%status=''evidence_ready''%status=''formula_generating''%',false),
    'formula failures preserve evidence and do not increment research attempts'

  union all select '032','atomic approval completes only an exact approved 2x3 matrix',
    coalesce(regexp_replace(pg_get_functiondef(to_regprocedure('public.approve_trend_formula_set_and_complete_job(uuid,uuid)')),'\s+','','g') ilike '%formula_count<>6%matrix_count<>6%approved_count<>6%status=''completed''%',false),
    'owner and evidence hash checks, approval, six-row read-back and completion share one transaction'

  union all select '032','exact linen resume is hard-bound and zero-approved guarded',
    coalesce(regexp_replace(pg_get_functiondef(to_regprocedure('public.resume_exact_linen_formula_job(text)')),'\s+','','g') ilike '%2e0ef127-73cb-5bc6-8707-2d6305719e8c%37905936-ba71-5ea7-b0b9-72c3856527a7%status=''completed''%notexists%review_status=''approved''%',false),
    'only the confirmed false-completed linen job can return to evidence_ready'

  union all select 'security','all styling research tables have RLS enabled',
    not exists (
      select 1 from (values
        ('trend_style_evidence'),('trend_outfit_formulas'),('trend_formula_feedback'),
        ('trend_style_concepts'),('trend_style_research_jobs'),('trend_style_market_evidence'),
        ('trend_style_market_discovery_failures')
      ) expected(table_name)
      where not exists(
        select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=expected.table_name and c.relrowsecurity
      )
    ),
    'RLS on evidence, formulas, feedback, concepts, research jobs and market evidence'

  union all select 'security','anon and authenticated are blocked from internal styling tables',
    not exists (
      select 1 from (values
        ('trend_style_evidence'),('trend_style_concepts'),('trend_style_research_jobs'),('trend_style_market_evidence'),
        ('trend_style_market_discovery_failures')
      ) expected(table_name)
      where coalesce(has_table_privilege('anon',to_regclass(format('public.%I',expected.table_name)),'SELECT'),false)
         or coalesce(has_table_privilege('anon',to_regclass(format('public.%I',expected.table_name)),'INSERT'),false)
         or coalesce(has_table_privilege('anon',to_regclass(format('public.%I',expected.table_name)),'UPDATE'),false)
         or coalesce(has_table_privilege('anon',to_regclass(format('public.%I',expected.table_name)),'DELETE'),false)
         or coalesce(has_table_privilege('authenticated',to_regclass(format('public.%I',expected.table_name)),'SELECT'),false)
         or coalesce(has_table_privilege('authenticated',to_regclass(format('public.%I',expected.table_name)),'INSERT'),false)
         or coalesce(has_table_privilege('authenticated',to_regclass(format('public.%I',expected.table_name)),'UPDATE'),false)
         or coalesce(has_table_privilege('authenticated',to_regclass(format('public.%I',expected.table_name)),'DELETE'),false)
    ),
    'no direct SELECT/INSERT/UPDATE/DELETE grants on internal research tables'

  union all select 'security','approved formula read and authenticated feedback policies are scoped',
    exists(select 1 from pg_policies where schemaname='public' and tablename='trend_outfit_formulas' and cmd='SELECT' and qual ilike '%review_status%approved%')
      and exists(select 1 from pg_policies where schemaname='public' and tablename='trend_formula_feedback' and cmd='INSERT' and roles @> array['authenticated']::name[] and with_check ilike '%auth.uid()%user_id%'),
    'public formula access is approved-only; feedback insert is user-bound'

  union all select 'security','service_role can operate styling tables',
    not exists (
      select 1 from (values
        ('trend_style_evidence'),('trend_outfit_formulas'),('trend_formula_feedback'),
        ('trend_style_concepts'),('trend_style_research_jobs'),('trend_style_market_evidence'),
        ('trend_style_market_discovery_failures')
      ) expected(table_name)
      where not coalesce(has_table_privilege('service_role',to_regclass(format('public.%I',expected.table_name)),'SELECT'),false)
         or not coalesce(has_table_privilege('service_role',to_regclass(format('public.%I',expected.table_name)),'INSERT'),false)
         or not coalesce(has_table_privilege('service_role',to_regclass(format('public.%I',expected.table_name)),'UPDATE'),false)
         or not coalesce(has_table_privilege('service_role',to_regclass(format('public.%I',expected.table_name)),'DELETE'),false)
    ),
    'service_role has SELECT/INSERT/UPDATE/DELETE on all styling tables'

  union all select 'security','SECURITY DEFINER RPCs use fixed search_path',
    not exists (
      select 1 from (values
        ('public.approve_trend_formula_set(uuid)'),
        ('public.claim_next_trend_style_research_job(text)'),
        ('public.claim_next_image_generation_job_with_quota_policy(text,text,boolean,text,integer)'),
        ('public.defer_trend_style_research_job_quota(uuid,integer,timestamptz,text)'),
        ('public.recover_trend_style_research_job_attempt(uuid,uuid,integer,text)'),
        ('public.mark_trend_style_research_evidence_ready(uuid,integer,text[],text[],jsonb,text)'),
        ('public.begin_trend_style_formula_generation(uuid)'),
        ('public.defer_trend_style_formula_quota(uuid,timestamptz,text)'),
        ('public.return_trend_style_formula_to_evidence_ready(uuid,text)'),
        ('public.approve_trend_formula_set_and_complete_job(uuid,uuid)'),
        ('public.resume_exact_linen_formula_job(text)')
      ) expected(signature)
      left join pg_proc p on p.oid=to_regprocedure(expected.signature)
      where p.oid is null or not p.prosecdef or not coalesce(p.proconfig,'{}') @> array['search_path=public']
    ),
    'approval, styling claim and quota claim RPCs are SECURITY DEFINER with search_path=public'

  union all select 'security','RPC grants are service-role-only',
    not exists (
      select 1 from (values
        ('public.approve_trend_formula_set(uuid)'),
        ('public.claim_next_trend_style_research_job(text)'),
        ('public.claim_next_image_generation_job_with_quota_policy(text,text,boolean,text,integer)'),
        ('public.defer_trend_style_research_job_quota(uuid,integer,timestamptz,text)'),
        ('public.recover_trend_style_research_job_attempt(uuid,uuid,integer,text)'),
        ('public.mark_trend_style_research_evidence_ready(uuid,integer,text[],text[],jsonb,text)'),
        ('public.begin_trend_style_formula_generation(uuid)'),
        ('public.defer_trend_style_formula_quota(uuid,timestamptz,text)'),
        ('public.return_trend_style_formula_to_evidence_ready(uuid,text)'),
        ('public.approve_trend_formula_set_and_complete_job(uuid,uuid)'),
        ('public.resume_exact_linen_formula_job(text)')
      ) expected(signature)
      where to_regprocedure(expected.signature) is null
         or not coalesce(has_function_privilege('service_role',to_regprocedure(expected.signature),'EXECUTE'),false)
         or coalesce(has_function_privilege('anon',to_regprocedure(expected.signature),'EXECUTE'),false)
         or coalesce(has_function_privilege('authenticated',to_regprocedure(expected.signature),'EXECUTE'),false)
    ),
    'approval, styling claim and quota claim execute grants'
),
results as (
  select phase,check_name,coalesce(passed,false) as passed,details from checks
  union all
  select 'summary','all_styling_migration_checks_passed',coalesce(bool_and(coalesce(passed,false)),false),
    format('%s of %s individual checks passed',count(*) filter(where coalesce(passed,false)),count(*))
  from checks
)
select phase,check_name,passed,details
from results
order by case when phase='summary' then 1 else 0 end,phase,check_name;
