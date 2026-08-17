-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.36
-- ============================================================================

with checks as (
  select
    1 as seq,
    'monthly_rebuild_rpc'::text as check_name,
    case
      when to_regprocedure(
        'public.ta_recalculate_employee_month_v61136(text,date)'
      ) is not null
      then 'PASS'
      else 'FAIL'
    end as result,
    'ta_recalculate_employee_month_v61136(text,date)'::text as detail

  union all

  select
    2,
    'monthly_rebuild_calls_attendance_workday',
    case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n
          on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'ta_recalculate_employee_month_v61136'
          and pg_get_functiondef(p.oid)
              ilike '%rebuild_attendance_workday%'
      )
      then 'PASS'
      else 'FAIL'
    end,
    'Monthly RPC rebuilds attendance_workday before calculation'

  union all

  select
    3,
    'monthly_rebuild_calls_calculation',
    case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n
          on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'ta_recalculate_employee_month_v61136'
          and pg_get_functiondef(p.oid)
              ilike '%_ta_recalculate_after_schedule_change_v61029%'
      )
      then 'PASS'
      else 'FAIL'
    end,
    'Monthly RPC recalculates Attendance after rebuild'

  union all

  select
    4,
    'rebuild_attendance_workday_core',
    case
      when to_regprocedure(
        'public.rebuild_attendance_workday(date,date,text[])'
      ) is not null
      then 'PASS'
      else 'FAIL'
    end,
    'Attendance Workday rebuild core exists'

  union all

  select
    5,
    'attendance_calculation_core',
    case
      when to_regprocedure(
        'public._ta_recalculate_after_schedule_change_v61029(date,date,text[])'
      ) is not null
      then 'PASS'
      else 'FAIL'
    end,
    'Attendance calculation core exists'

  union all

  select
    6,
    'authenticated_execute_grant',
    case
      when has_function_privilege(
        'authenticated',
        'public.ta_recalculate_employee_month_v61136(text,date)',
        'EXECUTE'
      )
      then 'PASS'
      else 'FAIL'
    end,
    'authenticated can execute Monthly recalculation RPC'
)
select
  seq,
  check_name,
  result,
  detail
from checks
order by seq;
