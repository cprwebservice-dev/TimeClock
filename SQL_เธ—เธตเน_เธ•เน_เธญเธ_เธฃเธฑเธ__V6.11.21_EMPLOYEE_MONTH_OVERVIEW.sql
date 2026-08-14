-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.21
-- Employee Monthly Schedule / Attendance Overview
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

  if to_regprocedure(
    'public.ta_can_access_employee_v680(text,date,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680';
  end if;

  if to_regprocedure(
    'public._ta_recalculate_after_schedule_change_v61029(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_recalculate_after_schedule_change_v61029';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Secure monthly recalculation for one visible employee
--    - ใช้ได้เฉพาะพนักงานที่ User มีสิทธิ์ VIEW ในช่วงเดือนนั้น
--    - จำกัดเฉพาะ 1 คน / 1 เดือน เพื่อลดภาระและป้องกันการประมวลผลเกิน Scope
-- ---------------------------------------------------------------------------
drop function if exists
  public.ta_recalculate_employee_month_v61121(text,date);

create function public.ta_recalculate_employee_month_v61121(
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
  v_result jsonb;
begin
  if nullif(trim(coalesce(v_emp,'')),'') is null then
    raise exception 'EMPLOYEE_REQUIRED';
  end if;

  if p_month is null then
    raise exception 'MONTH_REQUIRED';
  end if;

  v_month_start := date_trunc('month',p_month)::date;
  v_month_end := (date_trunc('month',p_month) + interval '1 month - 1 day')::date;

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
    raise exception 'EMPLOYEE_OUTSIDE_MONTH: % | %',v_emp,v_month_start;
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

  v_result := public._ta_recalculate_after_schedule_change_v61029(
    v_access_start,
    v_access_end,
    array[v_emp]::text[]
  );

  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object(
      'emp_code',v_emp,
      'month',v_month_start,
      'start_date',v_access_start,
      'end_date',v_access_end,
      'scope_checked',true,
      'version','V6.11.21'
    );
end;
$$;

revoke all on function
  public.ta_recalculate_employee_month_v61121(text,date)
from public;

grant execute on function
  public.ta_recalculate_employee_month_v61121(text,date)
to authenticated;

notify pgrst, 'reload schema';

commit;
