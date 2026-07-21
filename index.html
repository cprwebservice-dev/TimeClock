-- =============================================================
-- Time-Clock Enterprise V5.6.3
-- ตารางจัดกะล่วงหน้า + วันหยุดประจำสัปดาห์/นักขัตฤกษ์
-- ใช้ชื่อ RPC ใหม่เพื่อไม่กระทบ ta_get_monthly_schedule รุ่นเดิม
-- =============================================================

begin;

create index if not exists idx_shift_calendar_month_emp
  on public.shift_calendar(work_date, emp_code)
  include (shift_code, is_confirmed);

create index if not exists idx_holidays_date
  on public.holidays(holiday_date);

create index if not exists idx_employees_active_period
  on public.employees(start_date, resign_date);

create or replace function public.ta_get_monthly_schedule_v563(
  p_month date,
  p_zone text default null,
  p_department text default null,
  p_emp_codes text[] default null,
  p_schedule_statuses text[] default null
)
returns table (
  work_date date,
  emp_code text,
  full_name text,
  position_name text,
  department text,
  zone text,
  area text,
  sub_area text,
  pc text,
  day_type text,
  is_public_holiday boolean,
  is_weekly_off boolean,
  holiday_name text,
  expected_day integer,
  auto_shift_code text,
  suggested_shift_code text,
  suggestion_confidence integer,
  assigned_shift_code text,
  effective_shift_code text,
  is_confirmed boolean,
  schedule_status text,
  actual_in_at time,
  actual_out_at time,
  first_in time,
  last_out time,
  shift_start_time time,
  shift_end_time time,
  schedule_note text,
  schedule_source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', p_month)::date;
  v_month_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_role text;
begin
  select up.role
    into v_role
  from public.ta_user_profiles up
  where up.user_id = auth.uid()
    and coalesce(up.is_active, false)
  limit 1;

  if v_role is null then
    raise exception 'USER_PROFILE_NOT_ACTIVE';
  end if;

  return query
  with recursive
  dates as (
    select generate_series(v_month_start, v_month_end, interval '1 day')::date as work_date
  ),
  pattern_cycles as (
    select spd.pattern_code, max(spd.day_no)::integer as cycle_days
    from public.shift_pattern_details spd
    group by spd.pattern_code
  ),
  employee_scope as (
    select
      public.normalize_emp_code(e."EmployeeId") as emp_code,
      e.full_name,
      e.position_name,
      e.department,
      coalesce(nullif(e.zone, ''), e.area) as zone,
      e.area,
      e.sub_area,
      e.pc,
      e.start_date,
      e.resign_date
    from public.employees e
    where (e.start_date is null or e.start_date <= v_month_end)
      and (e.resign_date is null or e.resign_date >= v_month_start)
      and (p_zone is null or coalesce(nullif(e.zone, ''), e.area) = p_zone)
      and (p_department is null or e.department = p_department)
      and (p_emp_codes is null or public.normalize_emp_code(e."EmployeeId") = any(p_emp_codes))
  ),
  matrix as (
    select d.work_date, es.*
    from dates d
    cross join employee_scope es
    where (es.start_date is null or d.work_date >= es.start_date)
      and (es.resign_date is null or d.work_date <= es.resign_date)
      and (
        v_role = 'HR_ADMIN'
        or exists (
          select 1
          from public.ta_user_scopes us
          where us.user_id = auth.uid()
            and coalesce(us.is_active, true)
            and coalesce(us.can_view, true)
            and (us.effective_from is null or us.effective_from <= d.work_date)
            and (us.effective_to is null or us.effective_to >= d.work_date)
            and (
              upper(coalesce(us.scope_type, '')) = 'ALL'
              or (upper(us.scope_type) = 'EMPLOYEE' and us.scope_value = es.emp_code)
              or (upper(us.scope_type) in ('ZONE','AREA') and us.scope_value = coalesce(es.zone, es.area))
              or (upper(us.scope_type) = 'SUB_AREA' and us.scope_value = es.sub_area)
              or (upper(us.scope_type) = 'DEPARTMENT' and us.scope_value = es.department)
            )
        )
      )
  ),
  enriched as (
    select
      m.*,
      h.holiday_name,
      (h.holiday_date is not null) as is_public_holiday,
      case
        when h.holiday_date is not null then false
        when public.parse_pc(m.pc) = '4' and extract(dow from m.work_date)::integer in (0, 6) then true
        when public.parse_pc(m.pc) = '5' and extract(dow from m.work_date)::integer = 0 then true
        else false
      end as is_weekly_off,
      ep.pattern_code,
      ep.effective_start as pattern_start,
      coalesce(ep.start_day_no, 1) as pattern_start_day,
      pc.cycle_days,
      sc.shift_code as assigned_shift_code,
      coalesce(sc.is_confirmed, false) as is_confirmed,
      sc.note as schedule_note,
      sc.source_type as schedule_source,
      aw.first_in,
      aw.last_out,
      aw.shift_code as attendance_shift_code,
      aw.shift_start_time as attendance_shift_start,
      aw.shift_end_time as attendance_shift_end
    from matrix m
    left join public.holidays h
      on h.holiday_date = m.work_date
    left join lateral (
      select p.pattern_code, p.effective_start, p.start_day_no
      from public.employee_shift_patterns p
      where p.emp_code = m.emp_code
        and p.effective_start <= m.work_date
        and (p.effective_end is null or p.effective_end >= m.work_date)
      order by p.effective_start desc, p.id desc
      limit 1
    ) ep on true
    left join pattern_cycles pc
      on pc.pattern_code = ep.pattern_code
    left join public.shift_calendar sc
      on sc.emp_code = m.emp_code
     and sc.work_date = m.work_date
    left join public.attendance_workday aw
      on aw.emp_code = m.emp_code
     and aw.work_date = m.work_date
  ),
  with_pattern as (
    select
      e.*,
      pd.shift_code as pattern_shift_code
    from enriched e
    left join lateral (
      select spd.shift_code
      from public.shift_pattern_details spd
      where spd.pattern_code = e.pattern_code
        and e.cycle_days is not null
        and e.cycle_days > 0
        and spd.day_no = (
          mod(
            (e.work_date - e.pattern_start)
            + e.pattern_start_day - 1,
            e.cycle_days
          ) + 1
        )
      limit 1
    ) pd on true
  ),
  calculated as (
    select
      wp.*,
      case
        when wp.is_public_holiday then 'HOL'
        when wp.pattern_shift_code is not null then upper(wp.pattern_shift_code)
        when wp.is_weekly_off then 'OFF'
        else 'D'
      end as calculated_auto_shift
    from with_pattern wp
  ),
  final_rows as (
    select
      c.work_date,
      c.emp_code,
      c.full_name,
      c.position_name,
      c.department,
      c.zone,
      c.area,
      c.sub_area,
      c.pc,
      case
        when c.is_public_holiday then 'PUBLIC_HOLIDAY'
        when c.is_weekly_off then 'WEEKLY_OFF'
        else 'WORKDAY'
      end as day_type,
      c.is_public_holiday,
      c.is_weekly_off,
      c.holiday_name,
      case when coalesce(sm_effective.is_workday, true) then 1 else 0 end::integer as expected_day,
      coalesce(c.attendance_shift_code, c.calculated_auto_shift) as auto_shift_code,
      coalesce(c.attendance_shift_code, c.calculated_auto_shift) as suggested_shift_code,
      case
        when c.assigned_shift_code is not null then 100
        when c.pattern_shift_code is not null then 95
        when c.is_public_holiday or c.is_weekly_off then 100
        else 70
      end::integer as suggestion_confidence,
      c.assigned_shift_code,
      coalesce(c.assigned_shift_code, c.attendance_shift_code, c.calculated_auto_shift) as effective_shift_code,
      c.is_confirmed,
      case
        when c.assigned_shift_code is not null and c.is_confirmed then 'CONFIRMED'
        when c.assigned_shift_code is not null then 'ASSIGNED'
        else 'AUTO'
      end as schedule_status,
      c.first_in as actual_in_at,
      c.last_out as actual_out_at,
      c.first_in,
      c.last_out,
      coalesce(sm_effective.start_time, c.attendance_shift_start) as shift_start_time,
      coalesce(sm_effective.end_time, c.attendance_shift_end) as shift_end_time,
      c.schedule_note,
      c.schedule_source
    from calculated c
    left join public.shift_master sm_effective
      on sm_effective.shift_code = coalesce(c.assigned_shift_code, c.attendance_shift_code, c.calculated_auto_shift)
  )
  select fr.*
  from final_rows fr
  where p_schedule_statuses is null
     or fr.schedule_status = any(p_schedule_statuses)
  order by fr.emp_code, fr.work_date;
end;
$$;

revoke all on function public.ta_get_monthly_schedule_v563(date,text,text,text[],text[]) from public;
grant execute on function public.ta_get_monthly_schedule_v563(date,text,text,text[],text[]) to authenticated;

notify pgrst, 'reload schema';

commit;
