# Trend Concept Migration Safety

Do not apply these out of order.

## Execution Order

1. `database/024_trend_concept_image_review.sql`
2. `database/025_trend_concept_pixel_validation.sql`
3. `database/026_trend_concept_validation_security.sql`

Run `database/verify_trend_concept_image_migrations.sql` before applying `025` or `026`.

## What To Verify

### 024 Compatibility

`024_trend_concept_image_review.sql` creates the review tables used by `025` and `026`. It also replaces the `image_generation_jobs.status` check constraint with:

```sql
status in ('pending', 'processing', 'completed', 'failed', 'failed_review')
```

Compatibility risk: if production contains any `image_generation_jobs.status` value outside that list before applying 024, the `validate constraint` step will fail. Run this read-only check first:

```sql
select status, count(*)
from image_generation_jobs
where status not in ('pending', 'processing', 'completed', 'failed', 'failed_review')
group by status
order by status;
```

Expected result before applying 024: zero rows.

### 025 Additive Check

`025_trend_concept_pixel_validation.sql` only adds columns and an index. It does not delete rows, rewrite existing rows, change public policies, or replace queue functions.

Read-only check after applying 024 and before applying 025:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('trend_concept_image_reviews', 'trend_concept_image_candidates')
order by table_name;
```

Expected result: both review tables are present.

### 026 Privacy And Scoped Queue Check

`026_trend_concept_validation_security.sql` removes the public review-table SELECT policies, revokes anon/authenticated access, keeps RLS enabled, grants service-role access needed by the worker, and creates `claim_next_image_generation_job_for_variant`.

Read-only verification after applying 026:

```sql
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
```

Expected result:

- `anon_can_select = false`
- `authenticated_can_select = false`
- `service_role_can_select = true`
- `service_role_can_insert = true`
- `service_role_can_update = true`

Confirm public policies are gone:

```sql
select policyname, tablename, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('trend_concept_image_reviews', 'trend_concept_image_candidates')
order by tablename, policyname;
```

Expected result: only `service_role` policies, no public readable policies.

Confirm the scoped claim function exists:

```sql
select proname
from pg_proc
where proname = 'claim_next_image_generation_job_for_variant'
  and pg_function_is_visible(oid);
```

Expected result: one row.

## Terminal Preflight

You can also run:

```bash
npm run images:verify-migrations
```

That script performs read-only service-role table checks and reports whether 024 is installed. It does not execute migrations or modify production data.
