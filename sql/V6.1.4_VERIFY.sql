-- =====================================================================
-- V6.1.4 Verification
-- =====================================================================

-- 1) Function ต้องมี 1 รายการ
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  case
    when pg_get_functiondef(p.oid) ilike '%V6.1.4_CURSOR_CHUNK%'
     and pg_get_functiondef(p.oid) ilike '%p_group_limit%'
    then 'PASS'
    else 'CHECK'
  end as classify_v614_check
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ta_classify_mobileta_import_chunk';

-- 2) Index สำหรับ cursor/classification
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_time_logs_mobileta_batch_all_cursor',
    'idx_time_logs_mobileta_lookup_mode'
  )
order by indexname;

-- 3) normalized_mode ต้องยังเป็น Generated Always
select
  column_name,
  is_generated,
  generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name = 'time_logs'
  and column_name = 'normalized_mode';

-- 4) ดู Batch ล่าสุด โดยไม่ผูกกับชื่อคอลัมน์สถิติที่อาจต่างกัน
select
  b.id,
  b.file_name,
  b.status,
  coalesce(nullif(to_jsonb(b)->>'inserted_rows','')::bigint,0) as inserted_rows,
  coalesce(nullif(to_jsonb(b)->>'classified_rows','')::bigint,0) as classified_rows,
  coalesce(nullif(to_jsonb(b)->>'existing_duplicate_rows','')::bigint,0) as duplicate_rows,
  b.error_message,
  b.created_at,
  b.updated_at
from public.ta_time_import_batches b
order by b.created_at desc
limit 10;

-- 5) จำนวนข้อมูล ALL ที่ยังรอจำแนกใน Batch ล่าสุด
with latest as (
  select id
  from public.ta_time_import_batches
  order by created_at desc
  limit 1
)
select
  count(*) as remaining_all_rows,
  count(distinct (tl.inout_date, tl.emp_code)) as remaining_employee_days
from public.time_logs tl
join latest l on l.id = tl.import_batch_id
where tl.source_sheet = 'MobileTA'
  and tl.inout_mode = 'ALL';
