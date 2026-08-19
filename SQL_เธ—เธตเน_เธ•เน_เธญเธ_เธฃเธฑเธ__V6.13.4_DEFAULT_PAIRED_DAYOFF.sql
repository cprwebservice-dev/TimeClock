-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.13.4
-- Default Paired Day-off Integration: Weekly Off + Monthly + Smart Day-off + Quota
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
  if to_regclass('public.ta_daily_work_plans') is null then raise exception 'MISSING_TABLE: ta_daily_work_plans'; end if;
  if to_regclass('public.ta_schedule_rule_assignments') is null then raise exception 'MISSING_TABLE: ta_schedule_rule_assignments'; end if;
  if to_regclass('public.ta_shift_schedule_rules_v6123') is null then raise exception 'MISSING_TABLE: ta_shift_schedule_rules_v6123'; end if;
  if to_regclass('public.ta_dayoff_settings') is null then raise exception 'MISSING_TABLE: ta_dayoff_settings'; end if;
  if to_regclass('public.ta_dayoff_opening_balance') is null then raise exception 'MISSING_TABLE: ta_dayoff_opening_balance'; end if;
  if to_regprocedure('public.ta_v6120_can_schedule()') is null then raise exception 'MISSING_FUNCTION: ta_v6120_can_schedule'; end if;
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

create index if not exists idx_daily_work_plans_emp_date_v6134
  on public.ta_daily_work_plans(emp_code,work_date);

create index if not exists idx_schedule_rule_assignments_emp_date_v6134
  on public.ta_schedule_rule_assignments(emp_code,work_date);

-- 3) Central resolver: Work Shift -> Paired Day-off Shift ----------------------
-- IMPORTANT: OFF is no longer used as the default weekly-off shift code.
-- The mapping is controlled by HR Admin in ta_shift_schedule_rules_v6123.
create or replace function public.ta_resolve_paired_dayoff_shift_v6134(
  p_work_shift_code text
)
returns table(
  work_shift_code text,
  off_shift_code text,
  off_shift_name text,
  off_start_time time,
  off_end_time time,
  mapping_valid boolean
)
language sql
stable
security definer
set search_path=public
as $$
  with p as (
    select case
      when upper(trim(coalesce(p_work_shift_code,''))) in ('ST5','SINGLE_0830_1800') then 'STD'
      when upper(trim(coalesce(p_work_shift_code,''))) in ('ST6','SINGLE_0830','SINGLE_0830_1730') then 'S043'
      else upper(trim(coalesce(p_work_shift_code,'')))
    end as work_code
  )
  select
    p.work_code::text,
    upper(trim(r.paired_off_shift_code))::text,
    os.shift_name::text,
    os.start_time,
    os.end_time,
    (
      nullif(trim(coalesce(r.paired_off_shift_code,'')),'') is not null
      and coalesce(os.is_active,false)
      and coalesce(os.is_workday,true)=false
    ) as mapping_valid
  from p
  left join public.ta_shift_schedule_rules_v6123 r
    on upper(trim(r.shift_code))=p.work_code
  left join public.shift_master os
    on upper(trim(os.shift_code))=upper(trim(r.paired_off_shift_code))
  where nullif(p.work_code,'') is not null;
$$;

revoke all on function public.ta_resolve_paired_dayoff_shift_v6134(text) from public;
grant execute on function public.ta_resolve_paired_dayoff_shift_v6134(text) to authenticated;

-- Keep the four current business mappings available as initial setup only.
-- DO NOTHING preserves later HR Admin changes.
insert into public.ta_shift_schedule_rules_v6123(
  shift_code,is_enabled,scope_mode,paired_off_shift_code
)
select x.work_code,true,'ALL',x.off_code
from (values
  ('STD','OSTD'),('S043','OS043'),('S134','OS134'),('S135','OS135')
) x(work_code,off_code)
where exists(
  select 1 from public.shift_master w
  where upper(trim(w.shift_code))=x.work_code
)
and exists(
  select 1 from public.shift_master o
  where upper(trim(o.shift_code))=x.off_code
    and coalesce(o.is_active,true)
    and coalesce(o.is_workday,true)=false
)
on conflict(shift_code) do nothing;

-- 4) Lightweight Schedule Grid ------------------------------------------------
-- Purpose:
-- - Preserve the same User Scope engine used by the existing Schedule page.
-- - Return only data required to draw the grid immediately.
-- - DO NOT join attendance_workday / ta_attendance_calculations / comp-off.
-- - Daily Work Plan and V6.12 Scheduling Rules are enriched asynchronously by
--   the frontend after the base grid has rendered.
create or replace function public.ta_get_schedule_range_light_v6134(
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
  start_date date,
  resign_date date,
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
      e.start_date::date as start_date,
      e.resign_date::date as resign_date,
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
      e.start_date,
      e.resign_date,
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
      p.start_date,
      p.resign_date,
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
      case
        when upper(trim(coalesce(d.shift_code,''))) in ('ST5','SINGLE_0830_1800') then 'STD'
        when upper(trim(coalesce(d.shift_code,''))) in ('ST6','SINGLE_0830','SINGLE_0830_1730') then 'S043'
        when nullif(trim(coalesce(d.shift_code,'')),'') is not null then upper(trim(d.shift_code))
        when upper(trim(coalesce(p.resolved_pattern_code,'')))='TECH_5D' then 'STD'
        else 'S043'
      end as default_shift_code
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

  pattern_with_dayoff as materialized (
    select
      p.*,
      case when coalesce(off.mapping_valid,false) then off.off_shift_code else null end as default_dayoff_shift_code,
      case when coalesce(off.mapping_valid,false) then off.off_start_time else null end as default_dayoff_start_time,
      case when coalesce(off.mapping_valid,false) then off.off_end_time else null end as default_dayoff_end_time
    from pattern_context p
    left join lateral public.ta_resolve_paired_dayoff_shift_v6134(p.default_shift_code) off
      on true
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
    from pattern_with_dayoff p
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
        when r.resolved_weekly_off then r.default_dayoff_shift_code
        when nullif(trim(coalesce(r.default_shift_code,'')),'') is not null
          then upper(trim(r.default_shift_code))
        when r.pattern_code='TECH_5D' then 'STD'
        else 'S043'
      end as auto_code,
      coalesce(
        r.assigned_code,
        case
          when r.resolved_public_holiday then 'HOL'
          when r.resolved_weekly_off then r.default_dayoff_shift_code
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
    c.start_date,
    c.resign_date,
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
        when c.resolved_weekly_off and c.default_dayoff_shift_code is null then 'WORK_PATTERN_WEEKLY_OFF_MAPPING_MISSING'
        when c.resolved_weekly_off then 'WORK_PATTERN_WEEKLY_OFF_PAIRED'
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

revoke all on function public.ta_get_schedule_range_light_v6134(
  date,date,text,text,text[],text[]
) from public;

grant execute on function public.ta_get_schedule_range_light_v6134(
  date,date,text,text,text[],text[]
) to authenticated;




-- ============================================================================
-- 3) MONTHLY PERSONAL OVERVIEW - dedicated lightweight RPC
--    Uses the same V6.13.4 schedule grid and adds only Daily Work Plan /
--    Scheduling Rule metadata needed by the personal calendar.
-- ============================================================================

create or replace function public.ta_get_employee_month_schedule_v6134(
  p_emp_code text,
  p_start_date date,
  p_end_date date
)
returns table (
  work_date date,
  emp_code text,
  full_name text,
  start_date date,
  resign_date date,
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
  shift_start_time time,
  shift_end_time time,
  schedule_note text,
  schedule_source text,
  pattern_code text,
  pattern_name text,
  template_code text,
  default_shift_code text,
  employee_default_template_code text,
  daily_work_template_code text,
  effective_work_template_code text,
  template_category text,
  customer_window_start time,
  customer_window_end time,
  work_plan_status text,
  schedule_rule_mode text,
  work_mode_code text,
  base_shift_code text,
  generated_shift_code text,
  first_segment_end time,
  second_segment_start time,
  second_segment_planned_end time,
  custom_start_time time,
  custom_end_time time,
  off_window_start time,
  off_window_end time,
  off_basis_shift_code text,
  planned_minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  with params as materialized (
    select
      public.normalize_emp_code(p_emp_code) as emp_code,
      least(coalesce(p_start_date,current_date),coalesce(p_end_date,current_date)) as start_date,
      greatest(coalesce(p_start_date,current_date),coalesce(p_end_date,current_date)) as end_date
  ),
  base as materialized (
    select s.*
    from params p
    cross join lateral public.ta_get_schedule_range_light_v6134(
      p.start_date,p.end_date,null,null,array[p.emp_code]::text[],null
    ) s
    where s.emp_code=p.emp_code
  ),
  plans as materialized (
    select
      d.emp_code,
      d.work_date,
      case
        when upper(trim(coalesce(d.template_code,''))) in ('EARLY_SPLIT_FLEX','SPLIT_FLEX') then 'SPLIT_FLEX'
        when upper(trim(coalesce(d.template_code,''))) in ('SINGLE_0830','SINGLE_0830_1730','ST6') then 'ST6'
        when upper(trim(coalesce(d.template_code,''))) in ('SINGLE_0830_1800','ST5') then 'ST5'
        else upper(trim(coalesce(d.template_code,'')))
      end as daily_work_template_code,
      d.customer_window_start,
      d.customer_window_end,
      d.status as work_plan_status
    from public.ta_daily_work_plans d
    join params p on d.emp_code=p.emp_code
    where d.work_date between p.start_date and p.end_date
      and coalesce(d.status,'') <> 'CANCELLED'
  ),
  rules as materialized (
    select r.*
    from public.ta_schedule_rule_assignments r
    join params p on r.emp_code=p.emp_code
    where r.work_date between p.start_date and p.end_date
  )
  select
    b.work_date,
    b.emp_code,
    b.full_name,
    b.start_date,
    b.resign_date,
    b.position_name,
    b.department,
    b.zone,
    b.area,
    b.sub_area,
    b.pc,
    b.day_type,
    b.is_public_holiday,
    b.is_weekly_off,
    b.holiday_name,
    b.expected_day,
    b.auto_shift_code,
    b.suggested_shift_code,
    b.suggestion_confidence,
    b.assigned_shift_code,
    b.effective_shift_code,
    b.is_confirmed,
    b.schedule_status,
    b.shift_start_time,
    b.shift_end_time,
    b.schedule_note,
    b.schedule_source,
    b.pattern_code,
    b.pattern_name,
    coalesce(nullif(p.daily_work_template_code,''),b.template_code) as template_code,
    b.default_shift_code,
    b.template_code as employee_default_template_code,
    p.daily_work_template_code,
    coalesce(nullif(p.daily_work_template_code,''),b.template_code) as effective_work_template_code,
    case
      when coalesce(nullif(p.daily_work_template_code,''),b.template_code)='SPLIT_FLEX'
        then 'NORMAL_LATE_CUSTOMER'
      else 'NORMAL'
    end as template_category,
    p.customer_window_start,
    p.customer_window_end,
    p.work_plan_status,
    r.work_mode_code as schedule_rule_mode,
    r.work_mode_code,
    r.base_shift_code,
    r.generated_shift_code,
    r.first_segment_end,
    r.second_segment_start,
    r.second_segment_planned_end,
    r.custom_start_time,
    r.custom_end_time,
    r.off_window_start,
    r.off_window_end,
    r.off_basis_shift_code,
    coalesce(r.planned_minutes,0)::integer as planned_minutes
  from base b
  left join plans p
    on p.emp_code=b.emp_code and p.work_date=b.work_date
  left join rules r
    on r.emp_code=b.emp_code and r.work_date=b.work_date
  order by b.work_date;
$$;

revoke all on function public.ta_get_employee_month_schedule_v6134(text,date,date) from public;
grant execute on function public.ta_get_employee_month_schedule_v6134(text,date,date) to authenticated;


-- ============================================================================
-- 5) Generated Day-off Shift for Hour-based special schedules
--    This replaces the old literal OFF fallback when OFF is disabled.
-- ============================================================================
create or replace function public.ta_v6134_upsert_generated_dayoff_shift(
  p_start_time time,
  p_end_time time,
  p_pattern_code text
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_pattern text:=upper(trim(coalesce(p_pattern_code,'TECH_6D')));
  v_code text;
  v_night boolean;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  if p_start_time is null or p_end_time is null then raise exception 'DAYOFF_TIME_REQUIRED'; end if;
  v_code := case when v_pattern='TECH_5D' then 'OH5' else 'OH6' end || to_char(p_start_time,'HH24MI') || to_char(p_end_time,'HH24MI');
  v_night := p_end_time<=p_start_time;

  insert into public.shift_master(
    shift_code,shift_name,start_time,end_time,is_night_shift,is_workday,
    break_minutes,is_active,note
  ) values(
    v_code,
    'วันหยุดตามกะ '||to_char(p_start_time,'HH24:MI')||'–'||to_char(p_end_time,'HH24:MI'),
    p_start_time,p_end_time,v_night,false,0,true,
    '[SYSTEM_GENERATED_V6120][DAYOFF_V6134]'
  )
  on conflict(shift_code) do update set
    shift_name=excluded.shift_name,
    start_time=excluded.start_time,
    end_time=excluded.end_time,
    is_night_shift=excluded.is_night_shift,
    is_workday=false,
    break_minutes=0,
    is_active=true,
    note='[SYSTEM_GENERATED_V6120][DAYOFF_V6134]';

  begin
    update public.shift_master
    set applicable_pattern_codes=array[v_pattern]::text[],
        scheduled_minutes_including_break=0,
        standard_work_minutes=0,
        updated_at=now()
    where upper(trim(shift_code))=v_code;
  exception when undefined_column then
    null;
  end;

  return v_code;
end;
$$;

revoke all on function public.ta_v6134_upsert_generated_dayoff_shift(time,time,text) from public;
grant execute on function public.ta_v6134_upsert_generated_dayoff_shift(time,time,text) to authenticated;

-- ============================================================================
-- 6) SMART DAY-OFF BASIS V6.13.4
--    Resolve from the last effective WORK shift, including an automatic/default
--    shift that has no physical row in shift_calendar.
-- ============================================================================

create or replace function public.ta_get_off_shift_basis_v6134(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_basis_date date;
  v_code text;
  v_mode text;
  v_base_code text;
  v_start time;
  v_end time;
  v_custom_start time;
  v_custom_end time;
  v_basis_code text;
  v_pair_code text;
  v_pair_name text;
  v_pair_start time;
  v_pair_end time;
  v_pattern text;
  v_generated_off_code text;
begin
  if p_work_date is null then raise exception 'WORK_DATE_REQUIRED'; end if;
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;

  select
    h.work_date,
    upper(trim(coalesce(h.assigned_shift_code,h.effective_shift_code,''))),
    sm.start_time,
    sm.end_time
  into v_basis_date,v_code,v_start,v_end
  from public.ta_get_schedule_range_light_v6134(
    p_work_date-14,
    p_work_date-1,
    null,
    null,
    array[v_emp]::text[],
    null
  ) h
  join public.shift_master sm
    on upper(trim(sm.shift_code))=upper(trim(coalesce(h.assigned_shift_code,h.effective_shift_code,'')))
   and coalesce(sm.is_active,true)
   and coalesce(sm.is_workday,true)
  order by h.work_date desc
  limit 1;

  if v_code is null then return null; end if;

  select
    upper(trim(coalesce(a.work_mode_code,''))),
    upper(trim(coalesce(a.base_shift_code,''))),
    a.custom_start_time,
    a.custom_end_time
  into v_mode,v_base_code,v_custom_start,v_custom_end
  from public.ta_schedule_rule_assignments a
  where a.emp_code=v_emp and a.work_date=v_basis_date
  limit 1;

  v_basis_code:=coalesce(nullif(v_base_code,''),v_code);

  select upper(trim(coalesce(h.pattern_code,'TECH_6D')))
    into v_pattern
  from public.ta_get_schedule_range_light_v6134(
    v_basis_date,v_basis_date,null,null,array[v_emp]::text[],null
  ) h
  limit 1;

  if v_mode='HOUR_BASED' and v_custom_start is not null and v_custom_end is not null then
    v_generated_off_code:=public.ta_v6134_upsert_generated_dayoff_shift(
      v_custom_start,v_custom_end,coalesce(v_pattern,'TECH_6D')
    );
    return jsonb_build_object(
      'basis_work_date',v_basis_date,
      'basis_shift_code',v_basis_code,
      'off_shift_code',v_generated_off_code,
      'off_shift_name','วันหยุดตามกะนับชั่วโมง',
      'off_start_time',v_custom_start,
      'off_end_time',v_custom_end,
      'resolution_type','DYNAMIC_SPECIAL_GENERATED',
      'mapping_missing',false
    );
  end if;

  if v_mode='SPLIT_WAIT_NIGHT' and nullif(v_base_code,'') is not null then
    select off.off_shift_code,off.off_shift_name,off.off_start_time,off.off_end_time
      into v_pair_code,v_pair_name,v_pair_start,v_pair_end
    from public.ta_resolve_paired_dayoff_shift_v6134(v_base_code) off
    where coalesce(off.mapping_valid,false)
    limit 1;

    if v_pair_code is not null then
      return jsonb_build_object(
        'basis_work_date',v_basis_date,
        'basis_shift_code',v_base_code,
        'off_shift_code',v_pair_code,
        'off_shift_name',v_pair_name,
        'off_start_time',v_pair_start,
        'off_end_time',v_pair_end,
        'resolution_type','MAPPED_SPECIAL_BASE',
        'mapping_missing',false
      );
    end if;
  end if;

  select off.off_shift_code,off.off_shift_name,off.off_start_time,off.off_end_time
    into v_pair_code,v_pair_name,v_pair_start,v_pair_end
  from public.ta_resolve_paired_dayoff_shift_v6134(v_basis_code) off
  where coalesce(off.mapping_valid,false)
  limit 1;

  if v_pair_code is null then
    return jsonb_build_object(
      'basis_work_date',v_basis_date,
      'basis_shift_code',v_basis_code,
      'off_shift_code',null,
      'off_shift_name',null,
      'off_start_time',v_start,
      'off_end_time',v_end,
      'resolution_type','MAPPING_MISSING',
      'mapping_missing',true
    );
  end if;

  return jsonb_build_object(
    'basis_work_date',v_basis_date,
    'basis_shift_code',v_basis_code,
    'off_shift_code',v_pair_code,
    'off_shift_name',v_pair_name,
    'off_start_time',v_pair_start,
    'off_end_time',v_pair_end,
    'resolution_type','MAPPED',
    'mapping_missing',false
  );
end;
$$;

revoke all on function public.ta_get_off_shift_basis_v6134(text,date) from public;
grant execute on function public.ta_get_off_shift_basis_v6134(text,date) to authenticated;


-- ============================================================================
-- 7) BULK SMART DAY-OFF SYNC V6.13.4
-- ============================================================================

create or replace function public.ta_sync_bulk_schedule_rules_v6134(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_emp text;
  v_date date;
  v_code text;
  v_note text;
  v_is_workday boolean;
  v_basis jsonb;
  v_synced integer:=0;
  v_cleared integer:=0;
  v_count integer:=0;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then raise exception 'SHIFT_ROWS_MUST_BE_ARRAY'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_count:=v_count+1;
    v_emp:=public.normalize_emp_code(v_item->>'emp_code');
    begin v_date:=(v_item->>'work_date')::date; exception when others then v_date:=null; end;
    v_code:=upper(nullif(trim(coalesce(v_item->>'shift_code','')),''));
    v_note:=nullif(v_item->>'note','');
    if nullif(v_emp,'') is null or v_date is null then continue; end if;

    if v_code is null or v_code in ('HOL','LV') then
      delete from public.ta_schedule_rule_assignments where emp_code=v_emp and work_date=v_date;
      if found then v_cleared:=v_cleared+1; end if;
      continue;
    end if;

    select coalesce(s.is_workday,true)
      into v_is_workday
    from public.shift_master s
    where upper(trim(s.shift_code))=v_code
    limit 1;

    if coalesce(v_is_workday,v_code<>'OFF') then
      delete from public.ta_schedule_rule_assignments where emp_code=v_emp and work_date=v_date;
      if found then v_cleared:=v_cleared+1; end if;
      continue;
    end if;

    v_basis:=public.ta_get_off_shift_basis_v6134(v_emp,v_date);
    if v_basis is null then
      delete from public.ta_schedule_rule_assignments where emp_code=v_emp and work_date=v_date;
      continue;
    end if;

    insert into public.ta_schedule_rule_assignments(
      emp_code,work_date,work_mode_code,base_shift_code,generated_shift_code,
      first_segment_end,second_segment_start,second_segment_planned_end,
      custom_start_time,custom_end_time,off_window_start,off_window_end,
      off_basis_shift_code,planned_minutes,validation_snapshot,note,created_by,updated_by
    ) values(
      v_emp,v_date,'DYNAMIC_OFF',null,null,null,null,null,null,null,
      nullif(v_basis->>'off_start_time','')::time,
      nullif(v_basis->>'off_end_time','')::time,
      upper(nullif(v_basis->>'basis_shift_code','')),
      0,'{}'::jsonb,coalesce(v_note,'Smart OFF V6.13.4'),auth.uid(),auth.uid()
    )
    on conflict(emp_code,work_date) do update set
      work_mode_code='DYNAMIC_OFF',base_shift_code=null,generated_shift_code=null,
      first_segment_end=null,second_segment_start=null,second_segment_planned_end=null,
      custom_start_time=null,custom_end_time=null,
      off_window_start=excluded.off_window_start,
      off_window_end=excluded.off_window_end,
      off_basis_shift_code=excluded.off_basis_shift_code,
      planned_minutes=0,validation_snapshot='{}'::jsonb,note=excluded.note,
      updated_at=now(),updated_by=auth.uid();
    v_synced:=v_synced+1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'processed_rows',v_count,
    'dayoff_synced',v_synced,
    'extensions_cleared',v_cleared,
    'version','V6.13.4'
  );
end;
$$;

revoke all on function public.ta_sync_bulk_schedule_rules_v6134(jsonb) from public;
grant execute on function public.ta_sync_bulk_schedule_rules_v6134(jsonb) to authenticated;


-- 8) Core shift-pattern compatibility ----------------------------------------
-- Keep the four operational master shifts aligned with their actual duration.
-- The update is guarded by the expected time window so a repurposed code is not
-- changed accidentally.
update public.shift_master
set applicable_pattern_codes=array['TECH_5D']::text[],updated_at=now()
where upper(trim(shift_code)) in ('STD','S134')
  and ((upper(trim(shift_code))='STD' and start_time=time '08:30' and end_time=time '18:00')
    or (upper(trim(shift_code))='S134' and start_time=time '19:30' and end_time=time '05:00'));

update public.shift_master
set applicable_pattern_codes=array['TECH_6D']::text[],updated_at=now()
where upper(trim(shift_code)) in ('S043','S135')
  and ((upper(trim(shift_code))='S043' and start_time=time '08:30' and end_time=time '17:30')
    or (upper(trim(shift_code))='S135' and start_time=time '19:30' and end_time=time '04:30'));

-- 9) Safe compatibility cleanup for old/custom Shift Master rows -------------
-- An empty applicable_pattern_codes array historically hides the shift from
-- every assignment popup. Treat empty as both patterns, matching the column's
-- original default. This does NOT change rows that already have a configured
-- pattern restriction.
update public.shift_master
set applicable_pattern_codes=array['TECH_5D','TECH_6D']::text[],
    updated_at=now()
where coalesce(is_workday,true)
  and coalesce(cardinality(applicable_pattern_codes),0)=0;

analyze public.shift_calendar;
analyze public.ta_employee_work_patterns;
analyze public.ta_work_pattern_default_shifts;
analyze public.ta_schedule_rule_assignments;
analyze public.shift_master;

-- ============================================================================
-- 10) Day-off Quota aligned with automatic paired weekly-off schedule
--     Default weekly off / public holiday counts as USED unless explicitly
--     overridden by a working shift. A manually assigned day-off shift on a
--     different date also counts as USED. LV/LEAVE never consumes day-off quota.
-- ============================================================================
create or replace function public.ta_get_dayoff_balance_v6134(
  p_emp_code text,
  p_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_target date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_start date;
  v_position text;
  v_manager_pattern text;
  v_dows integer[];
  v_manager_dows integer[];
  v_other_dows integer[];
  v_month date;
  v_quota integer:=0;
  v_used integer:=0;
  v_balance numeric:=0;
  v_carry numeric:=0;
  v_open numeric:=0;
  v_carry_enabled boolean:=true;
  v_is_first boolean:=true;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  if nullif(v_emp,'') is null then raise exception 'EMP_CODE_REQUIRED'; end if;

  select s.effective_start_month,s.manager_position_pattern,
         s.manager_weekly_off_dows,s.other_weekly_off_dows,s.carry_forward_enabled
    into v_start,v_manager_pattern,v_manager_dows,v_other_dows,v_carry_enabled
  from public.ta_dayoff_settings s
  where s.setting_id=1;

  if v_start is null then raise exception 'DAYOFF_SETTINGS_NOT_FOUND'; end if;

  select nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),'')
    into v_position
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId")=v_emp
  order by e."EmployeeId"
  limit 1;

  v_dows:=case
    when coalesce(v_position,'') ilike '%'||coalesce(v_manager_pattern,'ผู้จัดการแผนก')||'%'
      then coalesce(v_manager_dows,array[0,6]::integer[])
    else coalesce(v_other_dows,array[0]::integer[])
  end;

  if v_target<v_start then
    return jsonb_build_object(
      'emp_code',v_emp,'position_name',v_position,'month',v_target,
      'effective_start_month',v_start,'month_quota_days',0,'used_days',0,
      'carried_in_days',0,'opening_days',0,'balance_days',0,
      'status','NOT_STARTED','version','V6.13.4'
    );
  end if;

  select coalesce(max(b.opening_days),0)
    into v_open
  from public.ta_dayoff_opening_balance b
  where public.normalize_emp_code(b.emp_code)=v_emp
    and b.start_month=v_start;

  for v_month in select generate_series(v_start,v_target,interval '1 month')::date
  loop
    if v_is_first then v_carry:=coalesce(v_open,0);v_is_first:=false;
    else v_carry:=case when coalesce(v_carry_enabled,true) then v_balance else 0 end;
    end if;

    select count(*)::integer
      into v_quota
    from generate_series(
      v_month,(v_month+interval '1 month'-interval '1 day')::date,interval '1 day'
    ) d(day_value)
    where extract(dow from d.day_value)::integer=any(v_dows)
       or exists(select 1 from public.holidays h where h.holiday_date=d.day_value::date);

    -- Used day-off:
    -- A) Explicit non-workday shift (OSTD/OS043/OS134/OS135/future day-off code/HOL)
    -- B) No explicit assignment on a policy weekend/public holiday -> default day-off used
    -- C) Explicit working shift on a policy day -> not used (employee worked instead)
    -- D) LV/LEAVE -> not counted as day-off quota usage.
    with days as (
      select d::date as work_date
      from generate_series(
        v_month,(v_month+interval '1 month'-interval '1 day')::date,interval '1 day'
      ) d
    ), cal as (
      select
        d.work_date,
        (extract(dow from d.work_date)::integer=any(v_dows)
          or exists(select 1 from public.holidays h where h.holiday_date=d.work_date)) as is_policy_dayoff
      from days d
    ), assigned as (
      select distinct on (c.work_date)
        c.work_date,
        upper(trim(coalesce(c.shift_code,''))) as shift_code,
        sm.is_workday
      from public.shift_calendar c
      left join public.shift_master sm
        on upper(trim(sm.shift_code))=upper(trim(c.shift_code))
      where public.normalize_emp_code(c.emp_code)=v_emp
        and c.work_date>=v_month
        and c.work_date<(v_month+interval '1 month')::date
      order by c.work_date
    )
    select count(*)::integer
      into v_used
    from cal d
    left join assigned a on a.work_date=d.work_date
    where case
      when a.shift_code in ('LV','LEAVE') then false
      when nullif(a.shift_code,'') is not null then
        a.shift_code='HOL'
        or coalesce(a.is_workday,true)=false
        or exists(
          select 1 from public.ta_shift_schedule_rules_v6123 r
          where r.paired_off_shift_code is not null
            and upper(trim(r.paired_off_shift_code))=a.shift_code
        )
      else d.is_policy_dayoff
    end;

    v_balance:=coalesce(v_carry,0)+coalesce(v_quota,0)-coalesce(v_used,0);
  end loop;

  return jsonb_build_object(
    'emp_code',v_emp,'position_name',v_position,'month',v_target,
    'effective_start_month',v_start,'opening_days',v_open,
    'month_quota_days',v_quota,'used_days',v_used,'carried_in_days',v_carry,
    'balance_days',v_balance,'weekly_off_dows',v_dows,
    'carry_forward_enabled',v_carry_enabled,
    'usage_basis','DEFAULT_POLICY_DAYOFF_PLUS_EXPLICIT_PAIRED_SHIFT',
    'status','ACTIVE','version','V6.13.4'
  );
end;
$$;

revoke all on function public.ta_get_dayoff_balance_v6134(text,date) from public;
grant execute on function public.ta_get_dayoff_balance_v6134(text,date) to authenticated;

notify pgrst, 'reload schema';
commit;
