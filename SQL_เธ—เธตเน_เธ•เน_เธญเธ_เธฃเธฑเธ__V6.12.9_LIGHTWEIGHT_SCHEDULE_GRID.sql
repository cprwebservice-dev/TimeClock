-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.12.9
-- Lightweight Schedule Grid
-- ============================================================================

begin;
set local statement_timeout = '0';

-- 1) Preflight ----------------------------------------------------------------
do $$
begin
  if to_regclass('public.employees') is null then raise exception 'MISSING_TABLE: employees'; end if;
  if to_regclass('public.shift_calendar') is null then raise exception 'MISSING_TABLE: shift_calendar'; end if;
  if to_regclass('public.shift_master') is null then raise exception 'MISSING_TABLE: shift_master'; end if;
  if to_regclass('public.holidays') is null then raise exception 'MISSING_TABLE: holidays'; end if;
  if to_regclass('public.ta_employee_work_patterns') is null then raise exception 'MISSING_TABLE: ta_employee_work_patterns'; end if;
  if to_regclass('public.ta_work_patterns') is null then raise exception 'MISSING_TABLE: ta_work_patterns'; end if;
  if to_regclass('public.ta_work_pattern_default_shifts') is null then raise exception 'MISSING_TABLE: ta_work_pattern_default_shifts'; end if;
  if to_regprocedure('public._ta_schedule_access_days_v61025(date,date,text,text,text[])') is null then
    raise exception 'MISSING_FUNCTION: _ta_schedule_access_days_v61025';
  end if;
end;
$$;

-- 2) Indexes used by the lightweight grid ------------------------------------
create index if not exists idx_shift_calendar_emp_date_v6129
  on public.shift_calendar(emp_code,work_date);

create index if not exists idx_employee_work_patterns_emp_dates_v6129
  on public.ta_employee_work_patterns(emp_code,effective_from,effective_to);

create index if not exists idx_work_pattern_default_shifts_pattern_v6129
  on public.ta_work_pattern_default_shifts(pattern_code);

create index if not exists idx_holidays_date_v6129
  on public.holidays(holiday_date);

-- 3) Lightweight Schedule Grid ------------------------------------------------
-- Purpose:
-- - Preserve the same User Scope engine used by the existing Schedule page.
-- - Return only data required to draw the grid immediately.
-- - DO NOT join attendance_workday / ta_attendance_calculations / comp-off.
-- - Daily Work Plan and V6.12 Scheduling Rules are enriched asynchronously by
--   the frontend after the base grid has rendered.
create or replace function public.ta_get_schedule_range_light_v6129(
  p_start_date date,
  p_end_date date,
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
  schedule_source text,
  pattern_code text,
  pattern_name text,
  template_code text,
  calculation_day_type text,
  paid_work_minutes numeric,
  regular_minutes numeric,
  overtime_minutes numeric,
  waiting_minutes numeric,
  offday_work_minutes numeric,
  comp_off_earned boolean,
  segment_count integer,
  calculation_status text,
  comp_off_balance numeric,
  default_shift_code text,
  pattern_scheduled_minutes integer,
  pattern_standard_work_minutes integer,
  shift_pattern_match boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with access_days as materialized (
    select a.emp_code,a.work_date
    from public._ta_schedule_access_days_v61025(
      p_start_date,
      p_end_date,
      p_zone,
      p_department,
      p_emp_codes
    ) a
  ),

  scoped_codes as materialized (
    select distinct a.emp_code
    from access_days a
  ),

  employee_meta as materialized (
    select
      public.normalize_emp_code(e."EmployeeId") as emp_code,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'full_name','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'employee_name','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'name','')),''),
        public.normalize_emp_code(e."EmployeeId")
      ) as full_name,
      nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),'') as position_name,
      nullif(trim(coalesce(to_jsonb(e)->>'department','')),'') as department,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'zone','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'area','')),'')
      ) as zone,
      nullif(trim(coalesce(to_jsonb(e)->>'area','')),'') as area,
      nullif(trim(coalesce(to_jsonb(e)->>'sub_area','')),'') as sub_area,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'pc','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'PC','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'PCgrade','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'pcgrade','')),'')
      ) as pc
    from public.employees e
    join scoped_codes s
      on s.emp_code = public.normalize_emp_code(e."EmployeeId")
  ),

  pattern_ranked as materialized (
    select
      a.emp_code,
      a.work_date,
      e.full_name,
      e.position_name,
      e.department,
      e.zone,
      e.area,
      e.sub_area,
      e.pc,
      coalesce(
        p.pattern_code,
        case
          when regexp_replace(upper(coalesce(e.pc,'')),'[^0-9]','','g')='4'
            then 'TECH_5D'
          else 'TECH_6D'
        end
      ) as resolved_pattern_code,
      p.override_weekly_off_dows,
      p.default_template_code,
      row_number() over (
        partition by a.emp_code,a.work_date
        order by p.effective_from desc nulls last,p.created_at desc nulls last
      ) as rn
    from access_days a
    join employee_meta e on e.emp_code=a.emp_code
    left join public.ta_employee_work_patterns p
      on p.emp_code=a.emp_code
     and p.effective_from<=a.work_date
     and (p.effective_to is null or p.effective_to>=a.work_date)
  ),

  pattern_context as materialized (
    select
      p.work_date,
      p.emp_code,
      p.full_name,
      p.position_name,
      p.department,
      p.zone,
      p.area,
      p.sub_area,
      p.pc,
      upper(trim(coalesce(p.resolved_pattern_code,'TECH_6D'))) as pattern_code,
      w.pattern_name,
      coalesce(
        p.override_weekly_off_dows,
        w.weekly_off_dows,
        case
          when upper(trim(coalesce(p.resolved_pattern_code,'')))='TECH_5D'
            then array[0,6]::integer[]
          else array[0]::integer[]
        end
      ) as weekly_off_dows,
      w.scheduled_minutes_including_break,
      w.standard_work_minutes,
      case
        when upper(trim(coalesce(p.default_template_code,''))) in ('EARLY_SPLIT_FLEX','SPLIT_FLEX')
          then 'SPLIT_FLEX'
        when upper(trim(coalesce(p.default_template_code,''))) in ('SINGLE_0830','SINGLE_0830_1730','ST6')
          then 'ST6'
        when upper(trim(coalesce(p.default_template_code,''))) in ('SINGLE_0830_1800','ST5')
          then 'ST5'
        when nullif(trim(coalesce(p.default_template_code,'')),'') is not null
          then upper(trim(p.default_template_code))
        when upper(trim(coalesce(p.resolved_pattern_code,'')))='TECH_5D'
          then 'ST5'
        else 'ST6'
      end as default_template_code,
      d.shift_code as default_shift_code
    from pattern_ranked p
    left join public.ta_work_patterns w
      on upper(trim(w.pattern_code))=upper(trim(p.resolved_pattern_code))
     and coalesce(w.is_active,true)
    left join lateral (
      select x.shift_code
      from public.ta_work_pattern_default_shifts x
      where upper(trim(x.pattern_code))=upper(trim(p.resolved_pattern_code))
      order by x.shift_code
      limit 1
    ) d on true
    where p.rn=1
  ),

  resolved as materialized (
    select
      p.*,
      h.holiday_name as resolved_holiday_name,
      (h.holiday_date is not null) as resolved_public_holiday,
      (
        h.holiday_date is null
        and extract(dow from p.work_date)::integer=any(p.weekly_off_dows)
      ) as resolved_weekly_off,
      nullif(upper(trim(coalesce(sc.shift_code,''))),'') as assigned_code,
      coalesce(nullif(to_jsonb(sc)->>'is_confirmed','')::boolean,false) as assigned_confirmed,
      nullif(to_jsonb(sc)->>'note','') as assignment_note,
      nullif(to_jsonb(sc)->>'source_type','') as assignment_source
    from pattern_context p
    left join public.holidays h
      on h.holiday_date=p.work_date
    left join public.shift_calendar sc
      on sc.emp_code=p.emp_code
     and sc.work_date=p.work_date
  ),

  codes as materialized (
    select
      r.*,
      case
        when r.resolved_public_holiday then 'HOL'
        when r.resolved_weekly_off then 'OFF'
        when nullif(trim(coalesce(r.default_shift_code,'')),'') is not null
          then upper(trim(r.default_shift_code))
        when r.pattern_code='TECH_5D' then 'STD'
        else 'S043'
      end as auto_code,
      coalesce(
        r.assigned_code,
        case
          when r.resolved_public_holiday then 'HOL'
          when r.resolved_weekly_off then 'OFF'
          when nullif(trim(coalesce(r.default_shift_code,'')),'') is not null
            then upper(trim(r.default_shift_code))
          when r.pattern_code='TECH_5D' then 'STD'
          else 'S043'
        end
      ) as display_code,
      case
        when r.assigned_code is null then 'AUTO'
        when r.assigned_confirmed then 'CONFIRMED'
        else 'ASSIGNED'
      end as resolved_schedule_status
    from resolved r
  )

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
      when c.resolved_public_holiday then 'PUBLIC_HOLIDAY'
      when c.resolved_weekly_off then 'WEEKLY_OFF'
      else 'WORKDAY'
    end as day_type,
    c.resolved_public_holiday as is_public_holiday,
    c.resolved_weekly_off as is_weekly_off,
    c.resolved_holiday_name as holiday_name,
    case when c.resolved_public_holiday or c.resolved_weekly_off then 0 else 1 end::integer as expected_day,
    c.auto_code as auto_shift_code,
    c.auto_code as suggested_shift_code,
    case
      when c.assigned_code is not null then 100
      when c.resolved_public_holiday or c.resolved_weekly_off then 100
      when c.default_shift_code is not null then 95
      else 80
    end::integer as suggestion_confidence,
    c.assigned_code as assigned_shift_code,
    c.display_code as effective_shift_code,
    c.assigned_confirmed as is_confirmed,
    c.resolved_schedule_status as schedule_status,
    null::time as actual_in_at,
    null::time as actual_out_at,
    null::time as first_in,
    null::time as last_out,
    sm.start_time as shift_start_time,
    sm.end_time as shift_end_time,
    c.assignment_note as schedule_note,
    coalesce(
      c.assignment_source,
      case
        when c.resolved_public_holiday then 'PUBLIC_HOLIDAY'
        when c.resolved_weekly_off then 'WORK_PATTERN_WEEKLY_OFF'
        else 'WORK_PATTERN_DEFAULT_SHIFT'
      end
    ) as schedule_source,
    c.pattern_code,
    coalesce(
      c.pattern_name,
      case when c.pattern_code='TECH_5D' then 'ทำงาน 5 วัน/สัปดาห์'
           when c.pattern_code='TECH_6D' then 'ทำงาน 6 วัน/สัปดาห์'
           else c.pattern_code end
    ) as pattern_name,
    c.default_template_code as template_code,
    case
      when c.resolved_public_holiday then 'PUBLIC_HOLIDAY'
      when c.resolved_weekly_off then 'WEEKLY_OFF'
      else 'WORKDAY'
    end as calculation_day_type,
    null::numeric as paid_work_minutes,
    null::numeric as regular_minutes,
    null::numeric as overtime_minutes,
    null::numeric as waiting_minutes,
    null::numeric as offday_work_minutes,
    false as comp_off_earned,
    0::integer as segment_count,
    null::text as calculation_status,
    0::numeric as comp_off_balance,
    c.default_shift_code,
    c.scheduled_minutes_including_break::integer as pattern_scheduled_minutes,
    c.standard_work_minutes::integer as pattern_standard_work_minutes,
    true as shift_pattern_match
  from codes c
  left join public.shift_master sm
    on upper(trim(sm.shift_code))=c.display_code
   and coalesce(sm.is_active,true)
  where p_schedule_statuses is null
     or c.resolved_schedule_status=any(p_schedule_statuses)
  order by c.emp_code,c.work_date;
$$;

revoke all on function public.ta_get_schedule_range_light_v6129(
  date,date,text,text,text[],text[]
) from public;

grant execute on function public.ta_get_schedule_range_light_v6129(
  date,date,text,text,text[],text[]
) to authenticated;

analyze public.shift_calendar;
analyze public.ta_employee_work_patterns;
analyze public.ta_work_pattern_default_shifts;

notify pgrst,'reload schema';
commit;
