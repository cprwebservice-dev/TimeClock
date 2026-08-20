-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.17
-- Position Policy + System Period Effective-Date Guard
-- ============================================================================

with checks as (
  select 1 as seq,'position_policy_rpc'::text as check_name,
    case when to_regprocedure('public._ta_employee_position_policy_v61417(text,date)') is not null then 'PASS' else 'FAIL' end as result,
    'Position Policy helper exists'::text as detail
  union all
  select 2,'effective_date_guard_rpc',
    case when to_regprocedure('public.ta_get_employee_pattern_effective_guard_v61417(date)') is not null then 'PASS' else 'FAIL' end,
    'Work Pattern start date is linked to System Period'
  union all
  select 3,'effective_date_guard_execute',
    case when has_function_privilege('authenticated','public.ta_get_employee_pattern_effective_guard_v61417(date)','EXECUTE') then 'PASS' else 'FAIL' end,
    'Authenticated can validate selected start date'
  union all
  select 4,'single_save_v61417',
    case when to_regprocedure('public.ta_assign_employee_work_pattern_v61417(text,text,text,date,date,integer[],text)') is not null then 'PASS' else 'FAIL' end,
    'Canonical single Work Pattern writer exists'
  union all
  select 5,'bulk_save_v61417',
    case when to_regprocedure('public.ta_assign_employee_work_patterns_bulk_v61417(jsonb)') is not null then 'PASS' else 'FAIL' end,
    'Bulk Work Pattern writer exists'
  union all
  select 6,'bulk_save_period_guard',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61417(text,text,text,date,date,integer[],text)'::regprocedure) ilike '%_ta_assert_employee_pattern_effective_date_v61417%' then 'PASS' else 'FAIL' end,
    'Database blocks Work Pattern start in closed period'
  union all
  select 7,'department_manager_forces_5d',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61417(text,text,text,date,date,integer[],text)'::regprocedure) ilike '%forced_pattern_code%' then 'PASS' else 'FAIL' end,
    'Department Manager policy is enforced before save'
  union all
  select 8,'position_aware_resolver',
    case when pg_get_functiondef('public.ta_resolve_employee_work_pattern_v651(text,date)'::regprocedure) ilike '%ผู้จัดการแผนก%' and pg_get_functiondef('public.ta_resolve_employee_work_pattern_v651(text,date)'::regprocedure) ilike '%ช่างเทคนิค%' then 'PASS' else 'FAIL' end,
    'Shared employee pattern resolver uses position-aware fallback'
  union all
  select 9,'position_aware_schedule_grid',
    case when pg_get_functiondef('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'::regprocedure) ilike '%ผู้จัดการแผนก%' and pg_get_functiondef('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'::regprocedure) ilike '%ช่างเทคนิค%' then 'PASS' else 'FAIL' end,
    'Main schedule grid uses the same fallback policy'
  union all
  select 10,'system_period_dependency',
    case when to_regprocedure('public._ta_system_period_state_v6110(date)') is not null and to_regclass('public.ta_system_periods') is not null then 'PASS' else 'FAIL' end,
    'System Period foundation exists'
)
select seq,check_name,result,detail from checks order by seq;

select
  period_month,
  schedule_edit_deadline,
  attendance_certify_deadline,
  schedule_open,
  certification_open,
  case
    when not schedule_open or public._ta_bangkok_today_v6110()>schedule_edit_deadline
      or not certification_open or public._ta_bangkok_today_v6110()>attendance_certify_deadline
      then 'CLOSED_FOR_WORK_PATTERN'
    else 'OPEN_FOR_WORK_PATTERN'
  end as work_pattern_status
from public.ta_system_periods
order by period_month desc
limit 12;
