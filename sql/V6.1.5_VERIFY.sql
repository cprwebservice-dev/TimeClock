-- =====================================================================
-- Time-Clock Enterprise V6.1.5 - Verification
-- =====================================================================

-- 1) ตรวจ Function ที่ติดตั้ง
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'ta_complete_mobileta_import',
    'ta_get_mobileta_import_resume_state',
    'ta_rebuild_mobileta_attendance_chunk',
    'ta_classify_mobileta_import_chunk'
  )
order by p.proname;

-- 2) ตรวจ Index สำคัญ
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_time_logs_mobileta_batch_all_remaining',
    'idx_time_logs_mobileta_batch_date_emp_resume',
    'idx_time_logs_mobileta_batch_all_cursor'
  )
order by indexname;

-- 3) ดู Batch ล่าสุดและจำนวน ALL ที่ยังเหลือ
select
  b.id,
  b.file_name,
  b.status,
  b.inserted_rows,
  b.existing_duplicate_rows,
  b.classified_rows,
  b.min_date,
  b.max_date,
  (
    select count(*)
    from public.time_logs tl
    where tl.import_batch_id = b.id
      and tl.source_sheet = 'MobileTA'
      and tl.inout_mode = 'ALL'
  ) as remaining_all_rows,
  b.error_message,
  b.created_at,
  b.finished_at
from public.ta_time_import_batches b
where b.source_type = 'MOBILETA_TEXT'
order by b.created_at desc
limit 10;

-- 4) ค่าที่ควรได้หลัง Batch สำเร็จ:
--    status = COMPLETED
--    remaining_all_rows = 0
