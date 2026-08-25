-- ==========================================================================
-- SQL ที่ต้องรัน
-- TimeAttendance V6.14.63
-- Historical Navigation Performance + Attendance Console Error Fix
-- ==========================================================================
-- เป้าหมาย
-- 1) ลด 500 / timeout ของ Attendance Detail ตอนย้อนเดือน โดยเฉพาะ Manager
-- 2) Pre-filter พนักงานตาม Manager Scope ก่อนเข้า canonical V6.14.55 reader
-- 3) เพิ่ม expression index ให้ query ที่ใช้ normalize_emp_code(...) ใช้ index ได้
-- 4) ไม่แก้ข้อมูล Attendance / Schedule / time_logs และไม่เปลี่ยนกฎคำนวณ
-- ==========================================================================

begin;
set local statement_timeout = '0';
select pg_advisory_xact_lock(hashtext('timeattendance_v61463_history_performance'));

do $$
begin
  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;
  if to_regclass('public.ta_attendance_calculations') is null then
    raise exception 'MISSING_TABLE: ta_attendance_calculations';
  end if;
  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;
  if to_regclass('public.time_logs') is null then
    raise exception 'MISSING_TABLE: time_logs';
  end if;
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;
  if to_regprocedure('public.normalize_emp_code(text)') is null then
    raise exception 'MISSING_FUNCTION: normalize_emp_code';
  end if;
  if to_regprocedure('public._ta_current_access_v681()') is null then
    raise exception 'MISSING_FUNCTION: _ta_current_access_v681';
  end if;
  if to_regprocedure('public._ta_scope_employee_ranges_v61022(date,date)') is null then
    raise exception 'MISSING_FUNCTION: _ta_scope_employee_ranges_v61022';
  end if;
  if to_regprocedure('public.ta_get_attendance_detail_v61020(date,date,text,text,text,text[],text[],text[],integer)') is null then
    raise exception 'MISSING_FUNCTION: ta_get_attendance_detail_v61020';
  end if;
  if to_regprocedure('public.ta_get_attendance_detail_v664(date,date,text,text,text[],text[],text[],integer)') is null then
    raise exception 'MISSING_FUNCTION: ta_get_attendance_detail_v664';
  end if;
end;
$$;

-- Query รุ่นปัจจุบันใช้ normalize_emp_code() ใน JOIN / filter หลายจุด
-- จึงเพิ่ม expression index โดยไม่เปลี่ยนข้อมูลเดิม
create index if not exists idx_attendance_workday_norm_emp_date_v61463
  on public.attendance_workday ((public.normalize_emp_code(emp_code)), work_date);

create index if not exists idx_attendance_calc_norm_emp_date_v61463
  on public.ta_attendance_calculations ((public.normalize_emp_code(emp_code)), work_date);

create index if not exists idx_shift_calendar_norm_emp_date_v61463
  on public.shift_calendar ((public.normalize_emp_code(emp_code)), work_date);

create index if not exists idx_time_logs_norm_emp_date_mode_time_v61463
  on public.time_logs (
    (public.normalize_emp_code(emp_code)),
    inout_date,
    normalized_mode,
    inout_time
  );

create or replace function public.ta_get_attendance_detail_v61463(
  p_start_date date,
  p_end_date date,
  p_area text default null,
  p_sub_area text default null,
  p_department text default null,
  p_emp_codes text[] default null,
  p_attendance_statuses text[] default null,
  p_schedule_statuses text[] default null,
  p_limit integer default 5000
)
returns table (
  work_date date,
  emp_code text,
  full_name text,
  department text,
  zone text,
  area text,
  sub_area text,
  effective_shift_start_time time,
  effective_shift_end_time time,
  effective_shift_code text,
  assigned_shift_code text,
  shift_code text,
  schedule_status text,
  actual_in_at time,
  actual_out_at time,
  first_in time,
  last_out time,
  net_work_minutes numeric,
  late_minutes numeric,
  early_leave_minutes numeric,
  attendance_result text,
  attendance_status text,
  pattern_code text,
  pattern_name text,
  template_code text,
  day_type text,
  planned_paid_minutes numeric,
  waiting_minutes numeric,
  break_deducted_minutes numeric,
  regular_minutes numeric,
  overtime_minutes numeric,
  offday_work_minutes numeric,
  comp_off_earned boolean,
  calculation_status text,
  segment_count integer,
  has_open_segment boolean,
  schedule_source text,
  comp_off_balance numeric,
  absence_minutes numeric,
  absence_reason text,
  display_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_is_active boolean := false;
  v_start date;
  v_end date;
  v_limit integer;
  v_scope_codes text[];
begin
  v_start := least(coalesce(p_start_date,current_date),coalesce(p_end_date,current_date));
  v_end := greatest(coalesce(p_start_date,current_date),coalesce(p_end_date,current_date));
  v_limit := greatest(1,least(coalesce(p_limit,5000),5000));

  select upper(coalesce(a.role,'')),coalesce(a.is_active,false)
    into v_role,v_is_active
  from public._ta_current_access_v681() a
  limit 1;

  if not v_is_active then
    return;
  end if;

  -- HR_ADMIN / VIEWER ใช้ canonical fast path เดิมของ V6.10.20 โดยตรง
  if v_role <> 'MANAGER' then
    return query
    select d.*
    from public.ta_get_attendance_detail_v61020(
      v_start,v_end,p_area,p_sub_area,p_department,p_emp_codes,
      p_attendance_statuses,p_schedule_statuses,v_limit
    ) d;
    return;
  end if;

  -- MANAGER: คำนวณรายชื่อที่อยู่ใน Scope เพียงครั้งเดียวต่อ request
  -- แล้วส่งเฉพาะรายชื่อนี้เข้าสู่ canonical V6.14.55/V6.6.4 reader
  -- (reader เดิมยังคงตรวจสิทธิ์รายวันเป็น safety net จึงไม่ลดความปลอดภัย)
  with requested as materialized (
    select distinct public.normalize_emp_code(x.emp_code) as emp_code
    from unnest(coalesce(p_emp_codes,array[]::text[])) x(emp_code)
    where nullif(public.normalize_emp_code(x.emp_code),'') is not null
  ), scoped as materialized (
    select distinct public.normalize_emp_code(s.emp_code) as emp_code
    from public._ta_scope_employee_ranges_v61022(v_start,v_end) s
    where nullif(public.normalize_emp_code(s.emp_code),'') is not null
      and (
        p_emp_codes is null
        or exists (
          select 1 from requested r
          where r.emp_code=public.normalize_emp_code(s.emp_code)
        )
      )
  )
  select coalesce(array_agg(s.emp_code order by s.emp_code),array[]::text[])
    into v_scope_codes
  from scoped s;

  if coalesce(cardinality(v_scope_codes),0)=0 then
    return;
  end if;

  return query
  select
    d.work_date,d.emp_code,d.full_name,d.department,d.zone,d.area,d.sub_area,
    d.effective_shift_start_time,d.effective_shift_end_time,d.effective_shift_code,
    d.assigned_shift_code,d.shift_code,d.schedule_status,d.actual_in_at,d.actual_out_at,
    d.first_in,d.last_out,d.net_work_minutes,d.late_minutes,d.early_leave_minutes,
    d.attendance_result,d.attendance_status,d.pattern_code,d.pattern_name,d.template_code,
    d.day_type,d.planned_paid_minutes,d.waiting_minutes,d.break_deducted_minutes,
    d.regular_minutes,d.overtime_minutes,d.offday_work_minutes,d.comp_off_earned,
    d.calculation_status,d.segment_count,d.has_open_segment,d.schedule_source,
    d.comp_off_balance,d.absence_minutes,d.absence_reason,d.display_status
  from public.ta_get_attendance_detail_v664(
    v_start,
    v_end,
    p_area,
    p_department,
    v_scope_codes,
    p_attendance_statuses,
    p_schedule_statuses,
    v_limit
  ) d
  where p_sub_area is null
     or trim(p_sub_area)=''
     or d.sub_area=trim(p_sub_area)
  order by d.work_date desc,d.emp_code
  limit v_limit;
end;
$$;

revoke all on function public.ta_get_attendance_detail_v61463(
  date,date,text,text,text,text[],text[],text[],integer
) from public;

grant execute on function public.ta_get_attendance_detail_v61463(
  date,date,text,text,text,text[],text[],text[],integer
) to authenticated;

comment on function public.ta_get_attendance_detail_v61463(
  date,date,text,text,text,text[],text[],text[],integer
) is 'V6.14.63: historical Attendance reader; Manager scope is prefiltered once and normalized employee/date indexes accelerate shared month-history readers.';


-- Dashboard reader: same V6.14.55 policy, but Scope is materialized once.
create or replace function public.ta_get_dashboard_overview_v61463(
  p_start_date date,
  p_end_date date,
  p_zone text default null,
  p_department text default null
)
returns table (
  total_employees bigint,
  total_rows bigint,
  complete_time_rows bigint,
  missing_in_rows bigint,
  missing_out_rows bigint,
  absent_rows bigint,
  no_time_rows bigint,
  worked_on_offday_rows bigint,
  need_review_rows bigint,
  confirmed_rows bigint,
  normal_rows bigint,
  late_rows bigint,
  early_leave_rows bigint,
  overtime_rows bigint,
  multi_segment_rows bigint,
  tech_6d_rows bigint,
  tech_5d_rows bigint,
  comp_off_earned_rows bigint,
  paid_work_minutes numeric,
  regular_minutes numeric,
  overtime_minutes numeric,
  waiting_minutes numeric,
  offday_work_minutes numeric,
  paid_work_hours numeric,
  regular_hours numeric,
  overtime_hours numeric,
  waiting_hours numeric,
  offday_work_hours numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with params as materialized (
    select
      least(coalesce(p_start_date,current_date),coalesce(p_end_date,current_date)) as start_date,
      greatest(coalesce(p_start_date,current_date),coalesce(p_end_date,current_date)) as end_date
  ), access_ranges as materialized (
    select
      public.normalize_emp_code(s.emp_code) as emp_code,
      greatest(s.access_from,p.start_date) as access_from,
      least(s.access_to,p.end_date) as access_to
    from params p
    cross join lateral public._ta_scope_employee_ranges_v61022(p.start_date,p.end_date) s
    where nullif(public.normalize_emp_code(s.emp_code),'') is not null
      and greatest(s.access_from,p.start_date) <= least(s.access_to,p.end_date)
  ), base as materialized (
    select
      public.normalize_emp_code(aw.emp_code) as emp_code,
      aw.work_date,
      aw.first_in,
      aw.last_out,
      aw.department,
      aw.area,
      sc.id as assignment_id,
      coalesce(sc.is_confirmed,false) as is_confirmed,
      sc.shift_code as assigned_shift_code,
      coalesce(sm.is_workday,false) as assigned_shift_is_workday,
      c.pattern_code,
      c.segment_count,
      c.comp_off_earned,
      c.calculation_status,
      c.day_type,
      c.expected_day,
      c.leave_request_id,
      c.paid_work_minutes,
      c.regular_minutes,
      c.overtime_minutes,
      c.waiting_minutes,
      c.offday_work_minutes,
      c.late_minutes,
      c.early_leave_minutes
    from params p
    join public.attendance_workday aw
      on aw.work_date between p.start_date and p.end_date
    join public.ta_attendance_calculations c
      on public.normalize_emp_code(c.emp_code)=public.normalize_emp_code(aw.emp_code)
     and c.work_date=aw.work_date
    left join public.shift_calendar sc
      on public.normalize_emp_code(sc.emp_code)=public.normalize_emp_code(aw.emp_code)
     and sc.work_date=aw.work_date
    left join public.shift_master sm
      on upper(trim(sm.shift_code))=upper(trim(sc.shift_code))
     and coalesce(sm.is_active,true)
    where exists (
      select 1
      from access_ranges a
      where a.emp_code=public.normalize_emp_code(aw.emp_code)
        and aw.work_date between a.access_from and a.access_to
    )
      and (p_zone is null or trim(p_zone)='' or aw.area=p_zone)
      and (p_department is null or trim(p_department)='' or aw.department=p_department)
  ), policy as materialized (
    select
      b.*,
      (
        b.leave_request_id is null
        and (
          (upper(coalesce(b.day_type,''))='WORKDAY' and coalesce(b.expected_day,0)=1)
          or b.assigned_shift_is_workday
        )
      ) as is_expected_workday,
      (b.first_in is not null and b.last_out is not null) as complete_pair
    from base b
  )
  select
    count(distinct b.emp_code)::bigint,
    count(*)::bigint,
    count(*) filter (where b.first_in is not null and b.last_out is not null)::bigint,
    count(*) filter (where b.is_expected_workday and b.first_in is null and b.last_out is not null)::bigint,
    count(*) filter (where b.is_expected_workday and b.first_in is not null and b.last_out is null)::bigint,
    count(*) filter (where b.is_expected_workday and (not b.complete_pair or coalesce(b.late_minutes,0)>=30))::bigint,
    count(*) filter (where b.is_expected_workday and b.first_in is null and b.last_out is null)::bigint,
    count(*) filter (where b.calculation_status in ('WORKED_ON_WEEKLY_OFF','WORKED_ON_HOLIDAY','WORKED_ON_COMP_OFF'))::bigint,
    count(*) filter (
      where (b.is_expected_workday and (not b.complete_pair or coalesce(b.late_minutes,0)>=1 or coalesce(b.early_leave_minutes,0)>0))
         or b.calculation_status in ('WORKED_ON_WEEKLY_OFF','WORKED_ON_HOLIDAY','WORKED_ON_COMP_OFF')
    )::bigint,
    count(*) filter (where b.assignment_id is not null and b.is_confirmed)::bigint,
    count(*) filter (where b.is_expected_workday and b.complete_pair and coalesce(b.late_minutes,0)<1 and coalesce(b.early_leave_minutes,0)<=0)::bigint,
    count(*) filter (where b.is_expected_workday and b.complete_pair and coalesce(b.late_minutes,0)>=1 and coalesce(b.late_minutes,0)<30)::bigint,
    count(*) filter (where b.is_expected_workday and b.complete_pair and coalesce(b.early_leave_minutes,0)>0)::bigint,
    count(*) filter (where b.overtime_minutes>0)::bigint,
    count(*) filter (where b.segment_count>1)::bigint,
    count(*) filter (where b.pattern_code='TECH_6D')::bigint,
    count(*) filter (where b.pattern_code='TECH_5D')::bigint,
    count(*) filter (where b.comp_off_earned)::bigint,
    coalesce(sum(b.paid_work_minutes),0)::numeric,
    coalesce(sum(b.regular_minutes),0)::numeric,
    coalesce(sum(b.overtime_minutes),0)::numeric,
    coalesce(sum(b.waiting_minutes),0)::numeric,
    coalesce(sum(b.offday_work_minutes),0)::numeric,
    round(coalesce(sum(b.paid_work_minutes),0)/60.0,2)::numeric,
    round(coalesce(sum(b.regular_minutes),0)/60.0,2)::numeric,
    round(coalesce(sum(b.overtime_minutes),0)/60.0,2)::numeric,
    round(coalesce(sum(b.waiting_minutes),0)/60.0,2)::numeric,
    round(coalesce(sum(b.offday_work_minutes),0)/60.0,2)::numeric
  from policy b;
$$;

revoke all on function public.ta_get_dashboard_overview_v61463(date,date,text,text) from public;
grant execute on function public.ta_get_dashboard_overview_v61463(date,date,text,text) to authenticated;
comment on function public.ta_get_dashboard_overview_v61463(date,date,text,text)
is 'V6.14.63: V6.14.55 dashboard policy with set-based employee/date scope instead of per-row permission RPC.';

notify pgrst, 'reload schema';
commit;
