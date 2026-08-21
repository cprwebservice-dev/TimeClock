-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.19
-- ============================================================================

with checks as (
  select 1 as seq,'monthly_guard_rpc'::text as check_name,
    case when to_regprocedure('public.ta_get_employee_pattern_month_guard_v61419(date)') is not null then 'PASS' else 'FAIL' end as result,
    'ta_get_employee_pattern_month_guard_v61419(date)'::text as detail
  union all
  select 2,'monthly_single_writer',
    case when to_regprocedure('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)') is not null then 'PASS' else 'FAIL' end,
    'ta_assign_employee_work_pattern_v61419'
  union all
  select 3,'monthly_bulk_writer',
    case when to_regprocedure('public.ta_assign_employee_work_patterns_bulk_v61419(jsonb)') is not null then 'PASS' else 'FAIL' end,
    'ta_assign_employee_work_patterns_bulk_v61419'
  union all
  select 4,'canonical_assignment_reader',
    case when to_regprocedure('public.ta_get_employee_pattern_assignments_v61419(text,date,integer)') is not null then 'PASS' else 'FAIL' end,
    'ta_get_employee_pattern_assignments_v61419'
  union all
  select 5,'writer_requires_month_start',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)'::regprocedure)
      ilike '%WORK_PATTERN_MONTH_START_REQUIRED%' then 'PASS' else 'FAIL' end,
    'Work Pattern เริ่มใช้ได้เฉพาะวันที่ 1 ของเดือน'
  union all
  select 6,'writer_requires_month_end',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)'::regprocedure)
      ilike '%WORK_PATTERN_MONTH_END_REQUIRED%' then 'PASS' else 'FAIL' end,
    'ถ้าระบุวันสิ้นสุด ต้องเป็นวันสุดท้ายของเดือน'
  union all
  select 7,'same_month_duplicate_cleanup',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)'::regprocedure)
      ilike '%same_month_legacy_rows_removed%' then 'PASS' else 'FAIL' end,
    'Save เดือนเดิมไม่ทิ้งแถวกลางเดือน/แถวซ้ำ'
  union all
  select 8,'system_period_guard_retained',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)'::regprocedure)
      ilike '%_ta_assert_employee_pattern_effective_date_v61417%' then 'PASS' else 'FAIL' end,
    'วันเริ่มใช้ยังอิงรอบแก้ไขกะ + รับรองเวลา'
  union all
  select 9,'edit_schedule_permission',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)'::regprocedure)
      ilike '%EDIT_SCHEDULE%' then 'PASS' else 'FAIL' end,
    'Writer ใช้สิทธิ์ EDIT_SCHEDULE'
  union all
  select 10,'deterministic_reader_order',
    case when pg_get_functiondef('public.ta_get_employee_pattern_assignments_v61419(text,date,integer)'::regprocedure)
      ilike '%ui_saved_at desc nulls last%' then 'PASS' else 'FAIL' end,
    'Reader เลือกแถวล่าสุดแบบ deterministic'
  union all
  select 11,'v61418_compatibility_bulk',
    case when pg_get_functiondef('public.ta_assign_employee_work_patterns_bulk_v61418(jsonb)'::regprocedure)
      ilike '%ta_assign_employee_work_patterns_bulk_v61419%' then 'PASS' else 'FAIL' end,
    'Frontend เก่ายังถูกบังคับ Monthly Rule'
)
select seq,check_name,result,detail from checks order by seq;
