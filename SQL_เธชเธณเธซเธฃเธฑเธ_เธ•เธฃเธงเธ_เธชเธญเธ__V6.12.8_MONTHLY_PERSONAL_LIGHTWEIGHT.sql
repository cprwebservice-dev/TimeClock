-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.12.8
-- ============================================================================

with checks as (
  select
    1 as seq,
    'monthly_personal_lightweight_rpc'::text as check_name,
    case when to_regprocedure(
      'public.ta_get_employee_month_schedule_v6128(text,date,date)'
    ) is not null then 'PASS' else 'FAIL' end as result,
    'RPC สำหรับ Monthly Personal Overview ต้องมีอยู่'::text as detail

  union all

  select
    2,
    'does_not_call_heavy_schedule_range',
    case when to_regprocedure('public.ta_get_employee_month_schedule_v6128(text,date,date)') is not null
      and pg_get_functiondef(
        'public.ta_get_employee_month_schedule_v6128(text,date,date)'::regprocedure
      ) not ilike '%ta_get_schedule_range_v61024%'
      then 'PASS' else 'FAIL' end,
    'Monthly Personal ต้องไม่เรียก ta_get_schedule_range_v61024'

  union all

  select
    3,
    'uses_scope_safe_work_plan',
    case when to_regprocedure('public.ta_get_employee_month_schedule_v6128(text,date,date)') is not null
      and pg_get_functiondef(
        'public.ta_get_employee_month_schedule_v6128(text,date,date)'::regprocedure
      ) ilike '%ta_get_schedule_work_plan_meta_v6126%'
      then 'PASS' else 'FAIL' end,
    'ใช้ Work Plan V6.12.6 ซึ่งเชื่อม User Scope ของ Schedule'

  union all

  select
    4,
    'includes_schedule_rules',
    case when to_regprocedure('public.ta_get_employee_month_schedule_v6128(text,date,date)') is not null
      and pg_get_functiondef(
        'public.ta_get_employee_month_schedule_v6128(text,date,date)'::regprocedure
      ) ilike '%ta_schedule_rule_assignments%'
      then 'PASS' else 'FAIL' end,
    'รองรับกะนับชั่วโมง / Split / Dynamic OFF ใน Monthly Personal'

  union all

  select
    5,
    'authenticated_execute',
    case when has_function_privilege(
      'authenticated',
      'public.ta_get_employee_month_schedule_v6128(text,date,date)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'authenticated ต้องเรียก RPC ได้'

  union all

  select
    6,
    'schedule_index',
    case when to_regclass('public.idx_shift_calendar_emp_date_v6128') is not null
      then 'PASS' else 'FAIL' end,
    'Index shift_calendar(emp_code,work_date)'
)
select seq,check_name,result,detail
from checks
order by seq;
