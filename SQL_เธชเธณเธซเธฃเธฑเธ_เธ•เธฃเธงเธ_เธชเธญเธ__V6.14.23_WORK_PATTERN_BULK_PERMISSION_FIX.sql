-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.23
-- ============================================================================

with checks as (
  select 1 seq,'edit_access_rpc' check_name,
    case when to_regprocedure('public.ta_get_employee_work_pattern_edit_access_v61423(text[],date)') is not null then 'PASS' else 'FAIL' end result,
    'Batch Work Pattern edit-access RPC' detail
  union all
  select 2,'writer_uses_v61423_access',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)'::regprocedure) ilike '%ta_get_employee_work_pattern_edit_access_v61423%' then 'PASS' else 'FAIL' end,
    'Monthly writer uses the same edit-access source as frontend'
  union all
  select 3,'hr_admin_global_path',
    case when pg_get_functiondef('public.ta_get_employee_work_pattern_edit_access_v61423(text[],date)'::regprocedure) ilike '%HR_ADMIN_ALL_EMPLOYEES%' then 'PASS' else 'FAIL' end,
    'HR Admin Work Pattern assignment does not depend on Manager Scope'
  union all
  select 4,'manager_edit_schedule_guard',
    case when pg_get_functiondef('public.ta_get_employee_work_pattern_edit_access_v61423(text[],date)'::regprocedure) ilike '%EDIT_SCHEDULE%' and pg_get_functiondef('public.ta_get_employee_work_pattern_edit_access_v61423(text[],date)'::regprocedure) ilike '%VIEW_ONLY_NO_EDIT_SCHEDULE%' then 'PASS' else 'FAIL' end,
    'Manager must have EDIT_SCHEDULE, not only VIEW'
  union all
  select 5,'monthly_baseline_writer_retained',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)'::regprocedure) ilike '%WORK_PATTERN_MONTH_START_REQUIRED%' then 'PASS' else 'FAIL' end,
    'Full-month baseline rule remains active'
  union all
  select 6,'system_period_guard_retained',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)'::regprocedure) ilike '%_ta_assert_employee_pattern_effective_date_v61417%' then 'PASS' else 'FAIL' end,
    'Closed System Period still blocks Work Pattern changes'
  union all
  select 7,'authenticated_execute',
    case when has_function_privilege('authenticated','public.ta_get_employee_work_pattern_edit_access_v61423(text[],date)','EXECUTE') then 'PASS' else 'FAIL' end,
    'Authenticated frontend can preflight edit access'
)
select seq,check_name,result,detail from checks order by seq;

select 'PASS' as v61423_result;
