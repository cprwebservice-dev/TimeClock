-- =====================================================================
-- Verify Time-Clock Enterprise V6.1.1 MobileTA generated-column fix
-- =====================================================================

-- 1) Confirm normalized_mode is generated and inspect expression
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_generated,
  c.generation_expression
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'time_logs'
  and c.column_name in ('inout_mode','normalized_mode')
order by c.ordinal_position;

-- 2) Confirm patched functions exist
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'ta_import_mobileta_chunk',
    '_ta_reclassify_mobileta_logs'
  )
order by p.proname;

-- 3) The import function must not explicitly INSERT normalized_mode
select
  case
    when pg_get_functiondef(
      'public.ta_import_mobileta_chunk(uuid,jsonb)'::regprocedure
    ) ilike '%insert into public.time_logs%normalized_mode%'
      then 'CHECK_FUNCTION_MANUALLY'
    else 'PASS'
  end as import_generated_column_check;

-- 4) Reclassify function must update inout_mode
select
  case
    when pg_get_functiondef(
      'public._ta_reclassify_mobileta_logs(text[],date,date)'::regprocedure
    ) ilike '%set inout_mode%'
      then 'PASS'
    else 'FAIL'
  end as reclassify_writable_column_check;

-- 5) Review recent failed/cancelled batches before retry
select
  id,
  file_name,
  status,
  total_rows,
  inserted_rows,
  existing_duplicate_rows,
  invalid_rows,
  error_message,
  created_at,
  finished_at
from public.ta_time_import_batches
order by created_at desc
limit 10;

-- 6) After a successful retry, check imported modes
select
  source_sheet,
  inout_mode,
  normalized_mode,
  count(*) as rows_count
from public.time_logs
where source_sheet = 'MobileTA'
group by source_sheet, inout_mode, normalized_mode
order by source_sheet, inout_mode, normalized_mode;
