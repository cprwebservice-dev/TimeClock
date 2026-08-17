-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.37
-- ============================================================================

with fn as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ta_process_attendance_rebuild_step'
    and pg_get_function_identity_arguments(p.oid) = 'p_job_id uuid'
  limit 1
),
checks as (
  select
    1 as seq,
    'attendance_pipeline_rpc'::text as check_name,
    case
      when to_regprocedure(
        'public.ta_process_attendance_rebuild_step(uuid)'
      ) is not null
      then 'PASS'
      else 'FAIL'
    end as result,
    'ta_process_attendance_rebuild_step(uuid)'::text as detail

  union all

  select
    2,
    'pipeline_rebuild_stage',
    case
      when exists(
        select 1 from fn
        where def ilike '%rebuild_attendance_workday%'
          and def ilike '%v_stage := ''REBUILD''%'
      )
      then 'PASS'
      else 'FAIL'
    end,
    'Task explicitly rebuilds Attendance Workday'

  union all

  select
    3,
    'pipeline_calculate_stage',
    case
      when exists(
        select 1 from fn
        where def ilike '%_ta_recalculate_after_schedule_change_v61029%'
          and def ilike '%v_stage := ''CALCULATE''%'
      )
      then 'PASS'
      else 'FAIL'
    end,
    'Task explicitly calculates Attendance after rebuild'

  union all

  select
    4,
    'pipeline_validate_stage',
    case
      when exists(
        select 1 from fn
        where def ilike '%v_stage := ''VALIDATE''%'
          and def ilike '%ATTENDANCE_PIPELINE_VALIDATION_FAILED%'
      )
      then 'PASS'
      else 'FAIL'
    end,
    'Task validates calculation result before COMPLETED'

  union all

  select
    5,
    'pipeline_error_stage_logging',
    case
      when exists(
        select 1 from fn
        where def ilike '%pipeline_stage=%'
          and def ilike '%AUTO_SPLIT%'
      )
      then 'PASS'
      else 'FAIL'
    end,
    'Error Log records failed pipeline stage and preserves auto-split'

  union all

  select
    6,
    'authenticated_execute_grant',
    case
      when has_function_privilege(
        'authenticated',
        'public.ta_process_attendance_rebuild_step(uuid)',
        'EXECUTE'
      )
      then 'PASS'
      else 'FAIL'
    end,
    'authenticated can execute Attendance worker RPC'

  union all

  select
    7,
    'monthly_pipeline_still_available',
    case
      when to_regprocedure(
        'public.ta_recalculate_employee_month_v61136(text,date)'
      ) is not null
      then 'PASS'
      else 'FAIL'
    end,
    'V6.11.36 Monthly Personal Overview recalculation remains available'
)
select
  seq,
  check_name,
  result,
  detail
from checks
order by seq;
