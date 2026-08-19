-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.12.9
-- Lightweight Schedule Grid
-- ============================================================================

with checks as (
  select
    1 as seq,
    'lightweight_schedule_rpc'::text as check_name,
    case when to_regprocedure(
      'public.ta_get_schedule_range_light_v6129(date,date,text,text,text[],text[])'
    ) is not null then 'PASS' else 'FAIL' end as result,
    'RPC ta_get_schedule_range_light_v6129 ต้องมีอยู่'::text as detail

  union all

  select
    2,
    'authenticated_execute',
    case when has_function_privilege(
      'authenticated',
      'public.ta_get_schedule_range_light_v6129(date,date,text,text,text[],text[])',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'authenticated ต้องเรียก Lightweight Schedule RPC ได้'

  union all

  select
    3,
    'uses_scope_engine',
    case when pg_get_functiondef(
      'public.ta_get_schedule_range_light_v6129(date,date,text,text,text[],text[])'::regprocedure
    ) ilike '%_ta_schedule_access_days_v61025%'
    then 'PASS' else 'FAIL' end,
    'ต้องคง User Scope engine เดิม'

  union all

  select
    4,
    'no_attendance_workday_join',
    case when pg_get_functiondef(
      'public.ta_get_schedule_range_light_v6129(date,date,text,text,text[],text[])'::regprocedure
    ) not ilike '%attendance_workday%'
    then 'PASS' else 'FAIL' end,
    'Base Schedule Grid ต้องไม่ Join attendance_workday'

  union all

  select
    5,
    'no_attendance_calculation_join',
    case when pg_get_functiondef(
      'public.ta_get_schedule_range_light_v6129(date,date,text,text,text[],text[])'::regprocedure
    ) not ilike '%ta_attendance_calculations%'
    then 'PASS' else 'FAIL' end,
    'Base Schedule Grid ต้องไม่ Join Attendance Calculation'

  union all

  select
    6,
    'no_comp_off_join',
    case when pg_get_functiondef(
      'public.ta_get_schedule_range_light_v6129(date,date,text,text,text[],text[])'::regprocedure
    ) not ilike '%ta_comp_off_credits%'
    then 'PASS' else 'FAIL' end,
    'Base Schedule Grid ต้องไม่คำนวณ Comp-off ต่อวัน'

  union all

  select
    7,
    'does_not_call_legacy_heavy_rpc',
    case when pg_get_functiondef(
      'public.ta_get_schedule_range_light_v6129(date,date,text,text,text[],text[])'::regprocedure
    ) not ilike '%ta_get_schedule_range_v61024%'
    then 'PASS' else 'FAIL' end,
    'V6.12.9 ต้องไม่เรียก RPC ตารางกะชุดใหญ่เดิม'

  union all

  select
    8,
    'schedule_index',
    case when to_regclass('public.idx_shift_calendar_emp_date_v6129') is not null
      then 'PASS' else 'FAIL' end,
    'Index shift_calendar(emp_code,work_date) ต้องพร้อมใช้งาน'
)
select seq,check_name,result,detail
from checks
order by seq;
