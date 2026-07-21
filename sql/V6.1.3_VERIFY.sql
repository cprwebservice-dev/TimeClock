-- =====================================================================
-- Time-Clock Enterprise V6.1.3 - Verification
-- =====================================================================

-- 1) ตรวจสอบ Unique Index/Constraint ของ time_logs
select
  i.relname as index_name,
  pg_get_indexdef(i.oid) as index_definition
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
join pg_index ix on ix.indrelid = t.oid
join pg_class i on i.oid = ix.indexrelid
where n.nspname = 'public'
  and t.relname = 'time_logs'
  and (
    i.relname = 'ux_time_logs_emp_date_time_mode'
    or pg_get_indexdef(i.oid) ilike '%emp_code%inout_date%inout_time%'
  )
order by i.relname;

-- 2) ตรวจสอบว่า Function รุ่นใหม่ถูกติดตั้งแล้ว
select
  case
    when pg_get_functiondef(
      'public.ta_classify_mobileta_import_step(uuid,date,date)'::regprocedure
    ) ilike '%V6.1.3_MOBILETA_DUPLICATE_SAFE%'
      then 'PASS'
    else 'FAIL'
  end as classify_v613_check;

-- 3) ตรวจว่ามีขั้นตอนลบรายการ Batch ที่จะชน Unique Key ก่อน UPDATE
select
  case
    when pg_get_functiondef(
      'public.ta_classify_mobileta_import_step(uuid,date,date)'::regprocedure
    ) ilike '%delete from public.time_logs%'
     and pg_get_functiondef(
      'public.ta_classify_mobileta_import_step(uuid,date,date)'::regprocedure
    ) ilike '%existing_duplicate_rows = existing_duplicate_rows + v_deduped%'
      then 'PASS'
    else 'FAIL'
  end as duplicate_collision_guard_check;

-- 4) ตรวจสอบ Batch ล่าสุด โดยไม่ผูกกับชื่อคอลัมน์ที่อาจต่างกันในแต่ละรุ่น
select
  b.id,
  b.file_name,
  b.status,
  coalesce(nullif(to_jsonb(b)->>'inserted_rows','')::bigint,0) as inserted_rows,
  coalesce(nullif(to_jsonb(b)->>'existing_duplicate_rows','')::bigint,0) as existing_duplicate_rows,
  coalesce(nullif(to_jsonb(b)->>'classified_rows','')::bigint,0) as classified_rows,
  coalesce(to_jsonb(b)->>'error_message','') as error_message,
  b.created_at,
  b.finished_at
from public.ta_time_import_batches b
order by b.created_at desc
limit 10;

-- 5) ตรวจสอบว่าฐานข้อมูลปัจจุบันไม่มีข้อมูลซ้ำตาม Key หลัก
select
  emp_code,
  inout_date,
  inout_time,
  normalized_mode,
  count(*) as duplicate_count
from public.time_logs
group by emp_code, inout_date, inout_time, normalized_mode
having count(*) > 1
order by duplicate_count desc, emp_code, inout_date, inout_time
limit 100;

-- 6) หลังนำเข้าสำเร็จ ตรวจสรุป MobileTA
select
  source_sheet,
  inout_mode,
  normalized_mode,
  count(*) as rows_count
from public.time_logs
where source_sheet = 'MobileTA'
group by source_sheet, inout_mode, normalized_mode
order by source_sheet, inout_mode, normalized_mode;
