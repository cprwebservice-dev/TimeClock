-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.36
-- Monthly Personal Overview: Rebuild Attendance Workday before Recalculate
-- ============================================================================

begin;

set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.employees') is null then
    raise exception 'MISSING_TABLE: employees';
  end if;

  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;

  if to_regprocedure(
    'public.normalize_emp_code(text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: normalize_emp_code';
  end if;

  if to_regprocedure(
    'public.ta_can_access_employee_v680(text,date,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680';
  end if;

  if to_regprocedure(
    'public.rebuild_attendance_workday(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: rebuild_attendance_workday';
  end if;

  if to_regprocedure(
    'public._ta_recalculate_after_schedule_change_v61029(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_recalculate_after_schedule_change_v61029';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Monthly Personal Overview recalculation
--
-- Flow:
--   Permission check
--   -> Rebuild attendance_workday ของพนักงานเฉพาะเดือนที่เลือก
--   -> Calculate Attendance
--   -> Frontend reload Monthly Personal Overview
--
-- Future dates are intentionally not rebuilt, so they remain "รอทำงาน".
-- ---------------------------------------------------------------------------
drop function if exists
  public.ta_recalculate_employee_month_v61136(text,date);

create function public.ta_recalculate_employee_month_v61136(
  p_emp_code text,
  p_month date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_month_start date;
  v_month_end date;
  v_employee_start date;
  v_employee_end date;
  v_access_start date;
  v_access_end date;
  v_process_end date;
  v_deleted integer := 0;
  v_inserted integer := 0;
  v_result jsonb;
begin
  if nullif(trim(coalesce(v_emp,'')),'') is null then
    raise exception 'EMPLOYEE_REQUIRED';
  end if;

  if p_month is null then
    raise exception 'MONTH_REQUIRED';
  end if;

  v_month_start := date_trunc('month',p_month)::date;
  v_month_end :=
    (date_trunc('month',p_month) + interval '1 month - 1 day')::date;

  select
    e.start_date,
    e.resign_date
  into
    v_employee_start,
    v_employee_end
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId") = v_emp
  limit 1;

  if not found then
    raise exception 'EMPLOYEE_NOT_FOUND: %',v_emp;
  end if;

  v_access_start := greatest(
    v_month_start,
    coalesce(v_employee_start,v_month_start)
  );

  v_access_end := least(
    v_month_end,
    coalesce(v_employee_end,v_month_end)
  );

  if v_access_start > v_access_end then
    raise exception
      'EMPLOYEE_OUTSIDE_MONTH: % | %',
      v_emp,
      v_month_start;
  end if;

  if not public.ta_can_access_employee_v680(
    v_emp,
    v_access_start,
    'VIEW'
  )
  or not public.ta_can_access_employee_v680(
    v_emp,
    v_access_end,
    'VIEW'
  ) then
    raise exception 'EMPLOYEE_MONTH_RECALC_SCOPE_DENIED';
  end if;

  -- Do not create Attendance for future dates.
  if v_access_start > current_date then
    return jsonb_build_object(
      'recalculated',false,
      'deferred',true,
      'reason','FUTURE_MONTH',
      'emp_code',v_emp,
      'month',v_month_start,
      'start_date',v_access_start,
      'end_date',v_access_end,
      'processed_end_date',null,
      'rebuild_deleted_rows',0,
      'rebuild_inserted_rows',0,
      'scope_checked',true,
      'version','V6.11.36'
    );
  end if;

  v_process_end := least(v_access_end,current_date);

  -- Rebuild first so past WORKDAY rows exist even when no IN/OUT punch exists.
  select
    coalesce(sum(r.deleted_rows),0)::integer,
    coalesce(sum(r.inserted_rows),0)::integer
  into
    v_deleted,
    v_inserted
  from public.rebuild_attendance_workday(
    v_access_start,
    v_process_end,
    array[v_emp]::text[]
  ) r;

  -- Then run the existing Attendance calculation core.
  v_result :=
    public._ta_recalculate_after_schedule_change_v61029(
      v_access_start,
      v_process_end,
      array[v_emp]::text[]
    );

  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object(
      'emp_code',v_emp,
      'month',v_month_start,
      'start_date',v_access_start,
      'end_date',v_access_end,
      'processed_end_date',v_process_end,
      'rebuild_performed',true,
      'rebuild_deleted_rows',v_deleted,
      'rebuild_inserted_rows',v_inserted,
      'scope_checked',true,
      'version','V6.11.36'
    );
end;
$$;

revoke all on function
  public.ta_recalculate_employee_month_v61136(text,date)
from public;

grant execute on function
  public.ta_recalculate_employee_month_v61136(text,date)
to authenticated;

notify pgrst, 'reload schema';

commit;
