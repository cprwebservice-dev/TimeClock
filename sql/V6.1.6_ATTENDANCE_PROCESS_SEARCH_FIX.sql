-- =====================================================================
-- Time-Clock Enterprise V6.1.6
-- Attendance processing + exact employee server search support
--
-- เป้าหมาย:
--   1) ให้ HR_ADMIN ประมวลผล attendance_workday ใหม่เป็นรายพนักงาน/ช่วงวันที่
--   2) ลดเวลาในการค้นหา time_logs และ attendance_workday รายพนักงาน
--   3) ใช้ร่วมกับหน้า Attendance ที่ค้นหารหัสพนักงานผ่าน p_emp_codes
-- =====================================================================

begin;

create index if not exists idx_time_logs_emp_date_mode_time_v616
  on public.time_logs(emp_code, inout_date, normalized_mode, inout_time);

create index if not exists idx_attendance_workday_emp_date_v616
  on public.attendance_workday(emp_code, work_date);

create or replace function public.ta_rebuild_attendance_employee(
  p_emp_code text,
  p_start_date date,
  p_end_date date
)
returns table (
  emp_code text,
  start_date date,
  end_date date,
  time_log_rows bigint,
  deleted_rows integer,
  inserted_rows integer,
  attendance_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp_code text := trim(coalesce(p_emp_code, ''));
  v_deleted integer := 0;
  v_inserted integer := 0;
  v_time_logs bigint := 0;
  v_attendance bigint := 0;
begin
  perform public._ta_require_hr_admin();
  perform set_config('statement_timeout', '45000', true);

  if v_emp_code = '' then
    raise exception 'EMP_CODE_REQUIRED';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'DATE_RANGE_REQUIRED';
  end if;

  if p_start_date > p_end_date then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  if (p_end_date - p_start_date) > 366 then
    raise exception 'DATE_RANGE_TOO_LARGE';
  end if;

  if not exists (
    select 1
    from public.employees e
    where trim(e.emp_code) = v_emp_code
  ) then
    raise exception 'EMPLOYEE_NOT_FOUND: %', v_emp_code;
  end if;

  select count(*)
  into v_time_logs
  from public.time_logs tl
  where trim(tl.emp_code) = v_emp_code
    and tl.inout_date between p_start_date and p_end_date;

  select
    coalesce(r.deleted_rows, 0),
    coalesce(r.inserted_rows, 0)
  into v_deleted, v_inserted
  from public.rebuild_attendance_workday(
    p_start_date,
    p_end_date,
    array[v_emp_code]::text[]
  ) r;

  select count(*)
  into v_attendance
  from public.attendance_workday aw
  where trim(aw.emp_code) = v_emp_code
    and aw.work_date between p_start_date and p_end_date;

  return query
  select
    v_emp_code,
    p_start_date,
    p_end_date,
    v_time_logs,
    v_deleted,
    v_inserted,
    v_attendance;
end;
$$;

grant execute on function public.ta_rebuild_attendance_employee(text,date,date)
  to authenticated;

notify pgrst, 'reload schema';
commit;
