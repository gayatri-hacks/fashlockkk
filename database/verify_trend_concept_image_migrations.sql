-- Read-only preflight for trend_concept image review migrations.
-- Run before applying 025 and 026.

select
  '024 tables installed' as check_name,
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'trend_concept_image_reviews'
  )
  and exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'trend_concept_image_candidates'
  ) as passed;

select
  '025 required columns present' as check_name,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trend_concept_image_candidates'
      and column_name = 'semantic_result'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generated_fashion_images'
      and column_name = 'pixel_integrity_hash'
  ) as passed;

select
  '026 scoped claim RPC present' as check_name,
  exists (
    select 1
    from pg_proc
    where proname = 'claim_next_image_generation_job_for_variant'
      and pg_function_is_visible(oid)
  ) as passed;

select
  '026 scoped claim RPC service_role executable' as check_name,
  has_function_privilege(
    'service_role',
    'public.claim_next_image_generation_job_for_variant(text, text, integer)',
    'EXECUTE'
  ) as passed;

select
  'unsafe public review policies still present' as check_name,
  count(*) = 0 as passed,
  array_agg(policyname order by policyname) filter (where policyname is not null) as remaining_public_policies
from pg_policies
where schemaname = 'public'
  and tablename in ('trend_concept_image_reviews', 'trend_concept_image_candidates')
  and policyname in (
    'trend concept image reviews are readable',
    'trend concept image candidates are readable'
  );

select
  table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'SELECT') as anon_can_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') as authenticated_can_select,
  has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') as service_role_can_select,
  has_table_privilege('service_role', format('public.%I', table_name), 'INSERT') as service_role_can_insert,
  has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE') as service_role_can_update
from (
  values
    ('trend_concept_image_reviews'),
    ('trend_concept_image_candidates')
) as review_tables(table_name);
