-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.4
-- ============================================================================

-- 1) RPC ใหม่ต้องมีครบ
select
  case when to_regprocedure(
    'public.ta_assign_shift_with_work_plan_v6144(text,date,text,text,time,time,text,text,text,boolean)'
  ) is not null then 'PASS' else 'FAIL' end as save_rpc_v6144,
  case when to_regprocedure(
    'public._ta_recalculate_single_after_schedule_v6144(text,date)'
  ) is not null then 'PASS' else 'FAIL' end as recalc_helper_v6144;

-- 2) Index สำหรับ Hot Path
select
  indexname,
  case when indexname in (
    'idx_attendance_workday_emp_date_v6144',
    'idx_shift_calendar_emp_date_v6144',
    'idx_shift_master_code_norm_v6144',
    'idx_schedule_rule_off_code_norm_v6144'
  ) then 'PASS' else 'CHECK' end as result
from pg_indexes
where schemaname='public'
  and indexname in (
    'idx_attendance_workday_emp_date_v6144',
    'idx_shift_calendar_emp_date_v6144',
    'idx_shift_master_code_norm_v6144',
    'idx_schedule_rule_off_code_norm_v6144'
  )
order by indexname;

-- 3) ยืนยันว่า RPC V6.14.4 ไม่เรียก ta_assign_shift_single_v651
--    และเรียก Recalculate helper เพียงจุดเดียว
select
  case
    when pg_get_functiondef(
      'public.ta_assign_shift_with_work_plan_v6144(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure
    ) not ilike '%ta_assign_shift_single_v651%'
     and pg_get_functiondef(
      'public.ta_assign_shift_with_work_plan_v6144(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure
    ) ilike '%_ta_recalculate_single_after_schedule_v6144%'
    then 'PASS'
    else 'FAIL'
  end as single_recalculation_path;

-- 4) ตรวจว่ากฎ Day-off Quota V6.14.3 ยังถูกเรียกใน RPC ใหม่
select
  case when pg_get_functiondef(
    'public.ta_assign_shift_with_work_plan_v6144(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure
  ) ilike '%ta_validate_dayoff_quota_v6143%'
  then 'PASS' else 'FAIL' end as dayoff_quota_guard_preserved;

-- 5) ตรวจสถิติข้อมูลที่สัมพันธ์กับ Hot Path
select
  (select count(*) from public.attendance_workday) as attendance_rows,
  (select count(*) from public.shift_calendar) as shift_calendar_rows,
  (select count(*) from public.ta_daily_work_plans) as daily_work_plan_rows;
