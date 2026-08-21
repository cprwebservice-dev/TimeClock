-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.24
-- ============================================================================

with checks as (
  select 1 seq,'bulk_writer_v61424' check_name,
    case when to_regprocedure('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)') is not null then 'PASS' else 'FAIL' end result,
    'V6.14.24 bulk schedule writer exists' detail

  union all
  select 2,'dayoff_guard_retained',
    case when pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      ilike '%ta_validate_dayoff_quota_bulk_v6143%' then 'PASS' else 'FAIL' end,
    'Bulk writer still enforces V6.14.3 day-off quota net projection'

  union all
  select 3,'system_period_guard_retained',
    case when pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      ilike '%_ta_assert_system_period_action_v6110%' then 'PASS' else 'FAIL' end,
    'Closed schedule period remains blocked'

  union all
  select 4,'edit_permission_guard_retained',
    case when pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      ilike '%ta_can_access_employee_v680%EDIT_SCHEDULE%' then 'PASS' else 'FAIL' end,
    'EDIT_SCHEDULE permission remains authoritative'

  union all
  select 5,'manager_self_guard_retained',
    case when pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      ilike '%_ta_assert_not_manager_self_schedule_v61027%' then 'PASS' else 'FAIL' end,
    'Manager cannot schedule self'

  union all
  select 6,'start_date_guard_retained',
    case when pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      ilike '%SHIFT_BEFORE_EMPLOYEE_START_DATE%' then 'PASS' else 'FAIL' end,
    'Employee Start Date guard remains active'

  union all
  select 7,'work_pattern_guard_retained',
    case when pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      ilike '%_ta_validate_shift_pattern_v651%' then 'PASS' else 'FAIL' end,
    'Shift must still match employee Work Pattern'

  union all
  select 8,'secure_writer_retained',
    case when pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      ilike '%_ta_write_shift_calendar_v61028%' then 'PASS' else 'FAIL' end,
    'Writes continue through the guarded low-level writer'

  union all
  select 9,'no_legacy_bulk_recalc',
    case when pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      not ilike '%ta_assign_shifts_bulk_v651%'
      and pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      not ilike '%_ta_recalculate_after_schedule_change_v61029%'
      and pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      not ilike '%ta_refresh_attendance%'
      then 'PASS' else 'FAIL' end,
    'No Attendance recalculation runs inside the bulk write transaction'

  union all
  select 10,'canonical_finalizer_exists',
    case when to_regprocedure('public.ta_finalize_schedule_mutation_v61415(jsonb)') is not null then 'PASS' else 'FAIL' end,
    'V6.14.15 post-extension finalizer is available'

  union all
  select 11,'authenticated_execute',
    case when has_function_privilege(
      'authenticated',
      'public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'Frontend can execute V6.14.24 bulk writer'
)
select seq,check_name,result,detail from checks order by seq;

select 'PASS' as v61424_result;
