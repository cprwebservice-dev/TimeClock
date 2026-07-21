-- =====================================================================
-- Time-Clock Enterprise V6.1.2 - Verification
-- =====================================================================

-- 1) New functions must exist
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'ta_import_mobileta_chunk',
    'ta_classify_mobileta_import_step',
    'ta_complete_mobileta_import',
    'ta_rebuild_mobileta_attendance_step',
    'ta_mark_mobileta_rebuild_result',
    'ta_cancel_mobileta_import'
  )
order by p.proname;

-- 2) Required batch columns
select
  column_name,
  data_type,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ta_time_import_batches'
  and column_name in (
    'classified_rows',
    'rebuild_failed_dates',
    'rebuild_deleted_rows',
    'rebuild_inserted_rows'
  )
order by column_name;

-- 3) normalized_mode must remain generated
select
  column_name,
  data_type,
  is_generated,
  generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name = 'time_logs'
  and column_name = 'normalized_mode';

-- 4) Supporting indexes
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_time_logs_mobileta_batch_date',
    'idx_time_logs_mobileta_emp_date',
    'idx_shift_calendar_emp_work_date',
    'idx_time_logs_import_batch',
    'idx_time_logs_source_hash_nonnull'
  )
order by indexname;

-- 5) Latest import batches, compatible with the actual table columns
select
  b.id,
  b.file_name,
  b.status,
  b.raw_rows,
  b.valid_rows,
  b.inserted_rows,
  b.existing_duplicate_rows,
  b.invalid_rows,
  b.unmatched_employee_rows,
  b.classified_rows,
  b.rebuild_attendance,
  b.rebuild_deleted_rows,
  b.rebuild_inserted_rows,
  b.rebuild_failed_dates,
  b.error_message,
  b.created_at,
  b.finished_at
from public.ta_time_import_batches b
order by b.created_at desc
limit 10;

-- 6) Imported MobileTA modes
select
  source_sheet,
  inout_mode,
  normalized_mode,
  count(*) as rows_count
from public.time_logs
where source_sheet = 'MobileTA'
group by source_sheet, inout_mode, normalized_mode
order by source_sheet, inout_mode, normalized_mode;
