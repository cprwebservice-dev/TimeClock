-- =====================================================================
-- Verify Time-Clock Enterprise V6.1 - MobileTA Text Import
-- =====================================================================

-- 1) ตารางและคอลัมน์
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('ta_time_import_batches','ta_time_import_errors')
order by table_name;

select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='time_logs'
  and column_name in ('source_hash','import_batch_id')
order by column_name;

-- 2) RPC / Functions
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'ta_begin_mobileta_import',
    'ta_log_mobileta_import_errors',
    'ta_import_mobileta_chunk',
    'ta_finish_mobileta_import',
    'ta_cancel_mobileta_import',
    'ta_get_mobileta_import_history',
    '_ta_reclassify_mobileta_logs'
  )
order by p.proname;

-- 3) Index ป้องกันข้อมูลซ้ำ
select indexname, indexdef
from pg_indexes
where schemaname='public'
  and indexname in (
    'idx_time_logs_source_hash_nonnull',
    'idx_time_logs_import_batch',
    'idx_ta_time_import_batches_created'
  )
order by indexname;

-- 4) ประวัติการนำเข้าล่าสุด
select
  created_at,
  file_name,
  raw_rows,
  inserted_rows,
  existing_duplicate_rows,
  unmatched_employee_rows,
  min_date,
  max_date,
  status,
  error_message
from public.ta_time_import_batches
order by created_at desc
limit 10;

-- 5) จำนวนข้อมูล MobileTA ที่นำเข้าผ่าน V6.1
select
  count(*) as mobileta_rows,
  count(*) filter (where normalized_mode='IN') as in_rows,
  count(*) filter (where normalized_mode='OUT') as out_rows,
  count(*) filter (where normalized_mode is null) as unclassified_rows,
  min(inout_date) as min_date,
  max(inout_date) as max_date
from public.time_logs
where source_sheet='MobileTA';
