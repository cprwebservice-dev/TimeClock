-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.12.8
-- Monthly Personal Overview - Lightweight Schedule RPC
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
  if to_regclass('public.ta_schedule_rule_assignments') is null then raise exception 'MISSING_TABLE: ta_schedule_rule_assignments'; end if;
  if to_regprocedure('public.ta_get_schedule_work_plan_meta_v6126(date,date,text[])') is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_work_plan_meta_v6126';
  end if;
end;
$$;

-- 2) Indexes used by the personal-month path ---------------------------------
create index if not exists idx_shift_calendar_emp_date_v6128
  on public.shift_calendar(emp_code,work_date);

create index if not exists idx_employee_work_patterns_emp_dates_v6128
  on public.ta_employee_work_patterns(emp_code,effective_from,effective_to);

create index if not exists idx_holidays_date_v6128
  on public.holidays(holiday_date);

-- 3) Lightweight Monthly Personal schedule -----------------------------------
-- Important:
-- - This RPC intentionally DOES NOT call ta_get_schedule_range_v61024.
-- - It does NOT join attendance calculation / comp-off calculation tables.
-- - Access control remains inherited from ta_get_schedule_work_plan_meta_v6126,
--   which uses the Schedule User Scope engine.
create or replace function public.ta_get_employee_month_schedule_v6128(
  p_emp_code text,
  p_start_date date,
  p_end_date date
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

  -- Work Plan metadata is already Scope-safe and returns only accessible days.
  plan as materialized (
    select m.*
    from params x
    cross join lateral public.ta_get_schedule_work_plan_meta_v6126(
      x.start_date,
      x.end_date,
      array[x.emp_code]::text[]
    ) m
    where m.emp_code = x.emp_code
  ),

  employee_meta as materialized (
    select
      public.normalize_emp_code(e."EmployeeId") as emp_code,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'full_name','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'employee_name','')),''),
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
    cross join params x
    where public.normalize_emp_code(e."EmployeeId") = x.emp_code
    order by e."EmployeeId"
    limit 1
  ),

  pattern_ranked as materialized (
    select
      p.*,
      a.override_weekly_off_dows,
      row_number() over (
        partition by p.emp_code,p.work_date
        order by a.effective_from desc nulls last,a.created_at desc nulls last
      ) as rn
    from plan p
    left join public.ta_employee_work_patterns a
      on a.emp_code = p.emp_code
     and a.effective_from <= p.work_date
     and (a.effective_to is null or a.effective_to >= p.work_date)
  ),

  context as materialized (
    select
      p.work_date,
      p.emp_code,
      p.pattern_code,
      p.employee_default_template_code,
      p.daily_work_template_code,
      p.effective_work_template_code,
      p.template_category,
      p.customer_window_start,
      p.customer_window_end,
      p.work_plan_status,
      p.override_weekly_off_dows,
      w.pattern_name,
      w.weekly_off_dows,
      d.shift_code as default_shift_code
    from pattern_ranked p
    left join public.ta_work_patterns w
      on upper(trim(w.pattern_code)) = upper(trim(p.pattern_code))
     and coalesce(w.is_active,true)
    left join lateral (
      select x.shift_code
      from public.ta_work_pattern_default_shifts x
      where upper(trim(x.pattern_code)) = upper(trim(p.pattern_code))
      order by x.shift_code
      limit 1
    ) d on true
    where p.rn = 1
  ),

  joined as materialized (
    select
      c.*,
      e.full_name,
      e.position_name,
      e.department,
      e.zone,
      e.area,
      e.sub_area,
      e.pc,
      h.holiday_name as public_holiday_name,
      (h.holiday_date is not null) as public_holiday,
      case
        when h.holiday_date is not null then false
        else extract(dow from c.work_date)::integer = any(
          coalesce(
            c.override_weekly_off_dows,
            c.weekly_off_dows,
            case when upper(trim(c.pattern_code))='TECH_5D' then array[0,6]::integer[] else array[0]::integer[] end
          )
        )
      end as weekly_off,
      sc.shift_code as assigned_code,
      coalesce(nullif(to_jsonb(sc)->>'is_confirmed','')::boolean,false) as assigned_confirmed,
      nullif(to_jsonb(sc)->>'note','') as assignment_note,
      nullif(to_jsonb(sc)->>'source_type','') as assignment_source,
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
      r.planned_minutes
    from context c
    left join employee_meta e on e.emp_code=c.emp_code
    left join public.holidays h on h.holiday_date=c.work_date
    left join public.shift_calendar sc
      on sc.emp_code=c.emp_code and sc.work_date=c.work_date
    left join public.ta_schedule_rule_assignments r
      on r.emp_code=c.emp_code and r.work_date=c.work_date
  ),

  codes as materialized (
    select
      j.*,
      case
        when j.public_holiday then 'HOL'
        when j.weekly_off then 'OFF'
        when nullif(trim(coalesce(j.default_shift_code,'')),'') is not null
          then upper(trim(j.default_shift_code))
        when upper(trim(j.pattern_code))='TECH_5D' then 'STD'
        else 'S043'
      end as auto_code,
      coalesce(
        nullif(upper(trim(coalesce(j.assigned_code,''))),''),
        case
          when j.public_holiday then 'HOL'
          when j.weekly_off then 'OFF'
          when nullif(trim(coalesce(j.default_shift_code,'')),'') is not null
            then upper(trim(j.default_shift_code))
          when upper(trim(j.pattern_code))='TECH_5D' then 'STD'
          else 'S043'
        end
      ) as effective_code
    from joined j
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
      when c.public_holiday then 'PUBLIC_HOLIDAY'
      when c.weekly_off then 'WEEKLY_OFF'
      else 'WORKDAY'
    end as day_type,
    c.public_holiday as is_public_holiday,
    c.weekly_off as is_weekly_off,
    c.public_holiday_name as holiday_name,
    case when c.public_holiday or c.weekly_off then 0 else 1 end::integer as expected_day,
    c.auto_code as auto_shift_code,
    c.auto_code as suggested_shift_code,
    case
      when nullif(trim(coalesce(c.assigned_code,'')),'') is not null then 100
      when c.public_holiday or c.weekly_off then 100
      when nullif(trim(coalesce(c.default_shift_code,'')),'') is not null then 95
      else 80
    end::integer as suggestion_confidence,
    nullif(upper(trim(coalesce(c.assigned_code,''))),'') as assigned_shift_code,
    c.effective_code as effective_shift_code,
    c.assigned_confirmed as is_confirmed,
    case
      when nullif(trim(coalesce(c.assigned_code,'')),'') is null then 'AUTO'
      when c.assigned_confirmed then 'CONFIRMED'
      else 'ASSIGNED'
    end as schedule_status,
    sm.start_time as shift_start_time,
    sm.end_time as shift_end_time,
    c.assignment_note as schedule_note,
    coalesce(
      c.assignment_source,
      case
        when c.public_holiday then 'PUBLIC_HOLIDAY'
        when c.weekly_off then 'WORK_PATTERN_WEEKLY_OFF'
        else 'WORK_PATTERN_DEFAULT_SHIFT'
      end
    ) as schedule_source,
    c.pattern_code,
    c.pattern_name,
    c.effective_work_template_code as template_code,
    c.default_shift_code,
    c.employee_default_template_code,
    c.daily_work_template_code,
    c.effective_work_template_code,
    c.template_category,
    c.customer_window_start,
    c.customer_window_end,
    c.work_plan_status,
    c.work_mode_code as schedule_rule_mode,
    c.work_mode_code,
    c.base_shift_code,
    c.generated_shift_code,
    c.first_segment_end,
    c.second_segment_start,
    c.second_segment_planned_end,
    c.custom_start_time,
    c.custom_end_time,
    c.off_window_start,
    c.off_window_end,
    c.off_basis_shift_code,
    coalesce(c.planned_minutes,0)::integer as planned_minutes
  from codes c
  left join public.shift_master sm
    on upper(trim(sm.shift_code))=c.effective_code
   and coalesce(sm.is_active,true)
  order by c.work_date;
$$;

revoke all on function public.ta_get_employee_month_schedule_v6128(text,date,date) from public;
grant execute on function public.ta_get_employee_month_schedule_v6128(text,date,date) to authenticated;

analyze public.shift_calendar;
analyze public.ta_employee_work_patterns;
analyze public.ta_schedule_rule_assignments;
notify pgrst,'reload schema';
commit;
