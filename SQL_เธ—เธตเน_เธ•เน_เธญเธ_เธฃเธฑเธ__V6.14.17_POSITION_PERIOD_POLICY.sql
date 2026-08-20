-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.17
-- Position-aware Technician Work Pattern + System Period Effective-Date Guard
-- ============================================================================

begin;
set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.employees') is null then
    raise exception 'MISSING_TABLE: employees';
  end if;
  if to_regclass('public.ta_employee_work_patterns') is null then
    raise exception 'MISSING_TABLE: ta_employee_work_patterns';
  end if;
  if to_regclass('public.ta_system_periods') is null then
    raise exception 'MISSING_TABLE: ta_system_periods';
  end if;
  if to_regprocedure('public._ta_system_period_state_v6110(date)') is null then
    raise exception 'MISSING_FUNCTION: _ta_system_period_state_v6110';
  end if;
  if to_regprocedure('public._ta_bangkok_today_v6110()') is null then
    raise exception 'MISSING_FUNCTION: _ta_bangkok_today_v6110';
  end if;
  if to_regprocedure('public.ta_assign_employee_work_pattern_v61110(text,text,date,date,integer[],text,text)') is null then
    raise exception 'MISSING_FUNCTION: ta_assign_employee_work_pattern_v61110';
  end if;
  if to_regprocedure('public.ta_refresh_attendance_consistency_v61415(date,date,text[])') is null then
    raise exception 'MISSING_FUNCTION: ta_refresh_attendance_consistency_v61415';
  end if;
  if to_regprocedure('public.ta_can_access_employee_v680(text,date,text)') is null then
    raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680';
  end if;
  if to_regprocedure('public._ta_validate_employee_default_shift_v61416(text,text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_validate_employee_default_shift_v61416';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Position policy.
--    Department Manager = mandatory 5-day pattern (Sat + Sun weekly off).
--    Technician / Senior Technician = selected 5D/6D remains allowed.
-- ---------------------------------------------------------------------------
create or replace function public._ta_employee_position_policy_v61417(
  p_emp_code text,
  p_effective_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_position text;
  v_pc text;
  v_policy text := 'STANDARD';
  v_forced_pattern text := null;
begin
  select
    coalesce(
      nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),''),
      nullif(trim(coalesce(to_jsonb(e)->>'PositionName','')),''),
      nullif(trim(coalesce(to_jsonb(e)->>'ตำแหน่ง','')),'')
    ),
    coalesce(
      nullif(trim(coalesce(to_jsonb(e)->>'pc','')),''),
      nullif(trim(coalesce(to_jsonb(e)->>'PC','')),''),
      nullif(trim(coalesce(to_jsonb(e)->>'PCgrade','')),''),
      nullif(trim(coalesce(to_jsonb(e)->>'pcgrade','')),'')
    )
  into v_position,v_pc
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId")=v_emp
  limit 1;

  if coalesce(v_position,'') ilike '%ผู้จัดการแผนก%'
     or coalesce(v_position,'') ~* 'ผจก\.?[^[:alnum:]]*แผนก' then
    v_policy := 'DEPARTMENT_MANAGER';
    v_forced_pattern := 'TECH_5D';
  elsif coalesce(v_position,'') ilike '%ช่างเทคนิค%' then
    v_policy := 'TECHNICIAN';
  end if;

  return jsonb_build_object(
    'emp_code',v_emp,
    'position_name',v_position,
    'pc',v_pc,
    'policy_code',v_policy,
    'forced_pattern_code',v_forced_pattern,
    'weekly_off_dows',case when v_forced_pattern='TECH_5D' then to_jsonb(array[6,0]::integer[]) else null end,
    'public_holiday_off',true,
    'effective_date',coalesce(p_effective_date,current_date),
    'version','V6.14.17'
  );
end;
$$;

revoke all on function public._ta_employee_position_policy_v61417(text,date) from public;

-- ---------------------------------------------------------------------------
-- 3) Work-pattern effective date guard.
--    Unlike normal Schedule editing, Work Pattern has NO HR Admin bypass for a
--    closed historical period. To change history, reopen the System Period first.
--    Closed = either Schedule editing OR Attendance certification is closed.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_pattern_effective_guard_v61417(
  p_effective_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_date date := coalesce(p_effective_date,current_date);
  v_today date := public._ta_bangkok_today_v6110();
  v_state jsonb;
  v_last_closed_month date;
  v_min_date date;
  v_selected_closed boolean := false;
  v_schedule_closed boolean := false;
  v_cert_closed boolean := false;
begin
  select max(p.period_month)
  into v_last_closed_month
  from public.ta_system_periods p
  where p.period_month <= date_trunc('month',v_today)::date
    and (
      coalesce(p.schedule_open,false)=false
      or v_today > p.schedule_edit_deadline
      or coalesce(p.certification_open,false)=false
      or v_today > p.attendance_certify_deadline
    );

  if v_last_closed_month is not null then
    v_min_date := (v_last_closed_month + interval '1 month')::date;
  end if;

  v_state := public._ta_system_period_state_v6110(v_date);
  if coalesce((v_state->>'configured')::boolean,false) then
    v_schedule_closed :=
      coalesce((v_state->>'schedule_open')::boolean,false)=false
      or coalesce((v_state->>'schedule_deadline_passed')::boolean,false)
      or upper(coalesce(v_state->>'schedule_status','')) in ('CLOSED_MANUAL','CLOSED_DEADLINE');
    v_cert_closed :=
      coalesce((v_state->>'certification_open')::boolean,false)=false
      or coalesce((v_state->>'certification_deadline_passed')::boolean,false)
      or upper(coalesce(v_state->>'certification_status','')) in ('CLOSED_MANUAL','CLOSED_DEADLINE');
    v_selected_closed := v_schedule_closed or v_cert_closed;
  end if;

  return jsonb_build_object(
    'allowed',not v_selected_closed and (v_min_date is null or v_date>=v_min_date),
    'effective_date',v_date,
    'minimum_effective_date',v_min_date,
    'suggested_effective_date',case
      when v_selected_closed then greatest(coalesce(v_min_date,(date_trunc('month',v_date)+interval '1 month')::date),(date_trunc('month',v_date)+interval '1 month')::date)
      when v_min_date is not null and v_date<v_min_date then v_min_date
      else v_date
    end,
    'configured',coalesce((v_state->>'configured')::boolean,false),
    'period_month',v_state->>'period_month',
    'schedule_status',v_state->>'schedule_status',
    'certification_status',v_state->>'certification_status',
    'schedule_closed',v_schedule_closed,
    'certification_closed',v_cert_closed,
    'last_closed_period_month',v_last_closed_month,
    'rule','WORK_PATTERN_REQUIRES_SCHEDULE_AND_CERTIFICATION_OPEN',
    'version','V6.14.17'
  );
end;
$$;

revoke all on function public.ta_get_employee_pattern_effective_guard_v61417(date) from public;
grant execute on function public.ta_get_employee_pattern_effective_guard_v61417(date) to authenticated;

create or replace function public._ta_assert_employee_pattern_effective_date_v61417(
  p_effective_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_guard jsonb;
begin
  if p_effective_date is null then raise exception 'EFFECTIVE_FROM_REQUIRED'; end if;
  v_guard := public.ta_get_employee_pattern_effective_guard_v61417(p_effective_date);
  if not coalesce((v_guard->>'allowed')::boolean,false) then
    raise exception 'EMPLOYEE_PATTERN_SYSTEM_PERIOD_CLOSED: % | MIN_EFFECTIVE_DATE=% | SCHEDULE=% | CERTIFICATION=%',
      p_effective_date,
      coalesce(v_guard->>'suggested_effective_date',v_guard->>'minimum_effective_date','-'),
      coalesce(v_guard->>'schedule_status','NOT_CONFIGURED'),
      coalesce(v_guard->>'certification_status','NOT_CONFIGURED');
  end if;
  return v_guard;
end;
$$;

revoke all on function public._ta_assert_employee_pattern_effective_date_v61417(date) from public;

-- ---------------------------------------------------------------------------
-- 4) Canonical single save with position + period protection.
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_employee_work_pattern_v61417(
  p_emp_code text,
  p_pattern_code text,
  p_default_shift_code text,
  p_effective_from date,
  p_effective_to date default null,
  p_override_weekly_off_dows integer[] default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_requested_pattern text := upper(trim(coalesce(p_pattern_code,'')));
  v_pattern text;
  v_requested_shift text := upper(trim(coalesce(p_default_shift_code,'')));
  v_shift_period text;
  v_shift text;
  v_template text;
  v_saved jsonb;
  v_assignment_id uuid;
  v_policy jsonb;
  v_period_guard jsonb;
  v_policy_adjusted boolean := false;
begin
  if nullif(v_emp,'') is null then raise exception 'EMPLOYEE_REQUIRED'; end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'INVALID_EFFECTIVE_DATE';
  end if;

  v_period_guard := public._ta_assert_employee_pattern_effective_date_v61417(p_effective_from);

  if not public.ta_can_access_employee_v680(v_emp,p_effective_from,'EDIT_SCHEDULE') then
    raise exception 'SCHEDULE_EDIT_PERMISSION_DENIED';
  end if;

  v_policy := public._ta_employee_position_policy_v61417(v_emp,p_effective_from);
  v_pattern := coalesce(nullif(v_policy->>'forced_pattern_code',''),v_requested_pattern);
  v_policy_adjusted := v_pattern is distinct from v_requested_pattern;

  if v_pattern not in ('TECH_5D','TECH_6D') then
    raise exception 'EMPLOYEE_WORK_PATTERN_NOT_SUPPORTED: %',v_pattern;
  end if;

  v_shift_period := case when v_requested_shift in ('S134','S135') then 'NIGHT' else 'DAY' end;
  v_shift := case
    when v_pattern='TECH_5D' and v_shift_period='NIGHT' then 'S134'
    when v_pattern='TECH_5D' then 'STD'
    when v_pattern='TECH_6D' and v_shift_period='NIGHT' then 'S135'
    else 'S043'
  end;
  v_shift := public._ta_validate_employee_default_shift_v61416(v_pattern,v_shift);

  v_template := case v_pattern
    when 'TECH_5D' then 'SINGLE_0830_1800'
    else 'SINGLE_0830_1730'
  end;

  v_saved := public.ta_assign_employee_work_pattern_v61110(
    v_emp,v_pattern,p_effective_from,p_effective_to,null,v_template,p_note
  );

  begin
    v_assignment_id := nullif(v_saved->>'id','')::uuid;
  exception when others then
    v_assignment_id := null;
  end;

  if v_assignment_id is not null then
    update public.ta_employee_work_patterns a
    set default_shift_code=v_shift,
        default_template_code=v_template,
        override_weekly_off_dows=null,
        ui_saved_at=now(),
        ui_saved_by=auth.uid(),
        ui_saved_by_email=coalesce(nullif(trim(auth.jwt()->>'email'),''),a.ui_saved_by_email),
        updated_at=now(),
        updated_by=auth.uid()
    where a.id=v_assignment_id;
  else
    update public.ta_employee_work_patterns a
    set default_shift_code=v_shift,
        default_template_code=v_template,
        override_weekly_off_dows=null,
        ui_saved_at=now(),
        ui_saved_by=auth.uid(),
        ui_saved_by_email=coalesce(nullif(trim(auth.jwt()->>'email'),''),a.ui_saved_by_email),
        updated_at=now(),
        updated_by=auth.uid()
    where a.id=(
      select x.id
      from public.ta_employee_work_patterns x
      where public.normalize_emp_code(x.emp_code)=v_emp
        and upper(trim(x.pattern_code))=v_pattern
        and x.effective_from=p_effective_from
      order by x.created_at desc,x.id desc
      limit 1
    );
  end if;

  select to_jsonb(a) into v_saved
  from public.ta_employee_work_patterns a
  where public.normalize_emp_code(a.emp_code)=v_emp
    and upper(trim(a.pattern_code))=v_pattern
    and a.effective_from=p_effective_from
  order by a.created_at desc,a.id desc
  limit 1;

  return coalesce(v_saved,'{}'::jsonb) || jsonb_build_object(
    'requested_pattern_code',v_requested_pattern,
    'effective_pattern_code',v_pattern,
    'default_shift_code',v_shift,
    'shift_period',v_shift_period,
    'position_policy_code',v_policy->>'policy_code',
    'position_name',v_policy->>'position_name',
    'policy_adjusted',v_policy_adjusted,
    'weekly_off_dows',case when v_pattern='TECH_5D' then to_jsonb(array[6,0]::integer[]) else to_jsonb(array[0]::integer[]) end,
    'public_holiday_off',true,
    'period_guard',v_period_guard,
    'version','V6.14.17'
  );
end;
$$;

revoke all on function public.ta_assign_employee_work_pattern_v61417(text,text,text,date,date,integer[],text) from public;
grant execute on function public.ta_assign_employee_work_pattern_v61417(text,text,text,date,date,integer[],text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Bulk save with the same policy per employee.
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_employee_work_patterns_bulk_v61417(
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_saved jsonb;
  v_processed integer := 0;
  v_policy_adjusted integer := 0;
  v_emp_codes text[] := array[]::text[];
  v_emp text;
  v_from date;
  v_to date;
  v_min_from date := null;
  v_max_to date := null;
  v_has_open_end boolean := false;
  v_recalc jsonb := null;
begin
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'EMPLOYEE_PATTERN_ROWS_MUST_BE_ARRAY';
  end if;
  if jsonb_array_length(coalesce(p_rows,'[]'::jsonb))=0 then
    raise exception 'EMPLOYEE_PATTERN_ROWS_REQUIRED';
  end if;
  if jsonb_array_length(p_rows)>2000 then
    raise exception 'EMPLOYEE_PATTERN_BULK_LIMIT_EXCEEDED: 2000';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_emp := public.normalize_emp_code(v_item->>'emp_code');
    begin v_from := (v_item->>'effective_from')::date;
    exception when others then raise exception 'INVALID_EFFECTIVE_FROM: %',coalesce(v_item->>'effective_from',''); end;
    begin v_to := nullif(v_item->>'effective_to','')::date;
    exception when others then raise exception 'INVALID_EFFECTIVE_TO: %',coalesce(v_item->>'effective_to',''); end;

    v_saved := public.ta_assign_employee_work_pattern_v61417(
      v_emp,
      v_item->>'pattern_code',
      v_item->>'default_shift_code',
      v_from,
      v_to,
      null,
      nullif(v_item->>'note','')
    );

    v_processed := v_processed + 1;
    if coalesce((v_saved->>'policy_adjusted')::boolean,false) then
      v_policy_adjusted := v_policy_adjusted + 1;
    end if;
    v_emp_codes := array_append(v_emp_codes,v_emp);
    v_min_from := least(coalesce(v_min_from,v_from),v_from);
    if v_to is null then v_has_open_end := true;
    else v_max_to := greatest(coalesce(v_max_to,v_to),v_to); end if;
  end loop;

  select coalesce(array_agg(distinct x order by x),array[]::text[])
  into v_emp_codes
  from unnest(v_emp_codes) x
  where nullif(x,'') is not null;

  if v_min_from is not null
     and v_min_from <= current_date
     and (v_has_open_end or coalesce(v_max_to,current_date)>=current_date)
     and cardinality(v_emp_codes)>0 then
    v_recalc := public.ta_refresh_attendance_consistency_v61415(current_date,current_date,v_emp_codes);
  end if;

  return jsonb_build_object(
    'processed_rows',v_processed,
    'employee_count',cardinality(v_emp_codes),
    'position_policy_adjusted_rows',v_policy_adjusted,
    'attendance_refresh',v_recalc,
    'auto_schedule_updates_immediately',true,
    'retroactive_rebuild_required',coalesce(v_min_from<current_date,false),
    'version','V6.14.17'
  );
end;
$$;

revoke all on function public.ta_assign_employee_work_patterns_bulk_v61417(jsonb) from public;
grant execute on function public.ta_assign_employee_work_patterns_bulk_v61417(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Reader for Bulk UI: position-aware fallback and policy metadata.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_pattern_default_shift_v61417(
  p_emp_codes text[],
  p_effective_date date default current_date
)
returns table(
  emp_code text,
  assigned_pattern_code text,
  effective_pattern_code text,
  effective_weekly_off_dows integer[],
  assigned_default_shift_code text,
  effective_default_shift_code text,
  shift_period text,
  shift_name text,
  shift_start_time time,
  shift_end_time time,
  default_shift_source text,
  position_policy_code text,
  forced_pattern_code text,
  public_holiday_off boolean
)
language sql
stable
security definer
set search_path=public
as $$
  with requested as (
    select distinct public.normalize_emp_code(x) as emp_code
    from unnest(coalesce(p_emp_codes,array[]::text[])) x
    where nullif(public.normalize_emp_code(x),'') is not null
  ), emp as (
    select
      r.emp_code,
      coalesce(nullif(to_jsonb(e)->>'pc',''),nullif(to_jsonb(e)->>'PC',''),nullif(to_jsonb(e)->>'PCgrade',''),nullif(to_jsonb(e)->>'pcgrade','')) as pc,
      coalesce(nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),''),nullif(trim(coalesce(to_jsonb(e)->>'PositionName','')),''),nullif(trim(coalesce(to_jsonb(e)->>'ตำแหน่ง','')),'') ) as position_name
    from requested r
    join public.employees e on public.normalize_emp_code(e."EmployeeId")=r.emp_code
    where public.ta_can_manage_employee_schedule(r.emp_code,coalesce(p_effective_date,current_date))
  ), ranked as (
    select
      e.emp_code,e.position_name,e.pc,
      a.pattern_code,
      nullif(upper(trim(coalesce(a.default_shift_code,''))),'') as assigned_shift,
      row_number() over(partition by e.emp_code order by a.effective_from desc nulls last,a.created_at desc nulls last) as rn
    from emp e
    left join public.ta_employee_work_patterns a
      on public.normalize_emp_code(a.emp_code)=e.emp_code
     and a.effective_from<=coalesce(p_effective_date,current_date)
     and (a.effective_to is null or a.effective_to>=coalesce(p_effective_date,current_date))
  ), resolved as (
    select
      r.*,
      case
        when coalesce(r.position_name,'') ilike '%ผู้จัดการแผนก%' or coalesce(r.position_name,'') ~* 'ผจก\.?[^[:alnum:]]*แผนก' then 'DEPARTMENT_MANAGER'
        when coalesce(r.position_name,'') ilike '%ช่างเทคนิค%' then 'TECHNICIAN'
        else 'STANDARD'
      end as policy_code,
      case
        when coalesce(r.position_name,'') ilike '%ผู้จัดการแผนก%' or coalesce(r.position_name,'') ~* 'ผจก\.?[^[:alnum:]]*แผนก' then 'TECH_5D'
        else null
      end as forced_pattern,
      coalesce(
        nullif(upper(trim(coalesce(r.pattern_code,''))),''),
        case
          when coalesce(r.position_name,'') ilike '%ผู้จัดการแผนก%' or coalesce(r.position_name,'') ~* 'ผจก\.?[^[:alnum:]]*แผนก' then 'TECH_5D'
          when coalesce(r.position_name,'') ilike '%ช่างเทคนิค%' then 'TECH_6D'
          when regexp_replace(upper(coalesce(r.pc,'')),'[^0-9]','','g')='4' then 'TECH_5D'
          else 'TECH_6D'
        end
      ) as effective_pattern
    from ranked r where r.rn=1
  ), canonical as (
    select
      r.*,
      case
        when r.assigned_shift in ('STD','S043','S134','S135') then
          case
            when r.effective_pattern='TECH_5D' and r.assigned_shift in ('S134','S135') then 'S134'
            when r.effective_pattern='TECH_5D' then 'STD'
            when r.effective_pattern='TECH_6D' and r.assigned_shift in ('S134','S135') then 'S135'
            else 'S043'
          end
        when r.effective_pattern='TECH_5D' then 'STD'
        else 'S043'
      end as effective_shift
    from resolved r
  )
  select
    r.emp_code,
    nullif(upper(trim(coalesce(r.pattern_code,''))),'')::text,
    r.effective_pattern::text,
    coalesce(wp.weekly_off_dows,case when r.effective_pattern='TECH_5D' then array[6,0]::integer[] else array[0]::integer[] end),
    r.assigned_shift::text,
    r.effective_shift::text,
    case when r.effective_shift in ('S134','S135') then 'NIGHT' else 'DAY' end::text,
    s.shift_name::text,
    s.start_time,
    s.end_time,
    case when r.assigned_shift is not null then 'EMPLOYEE_ASSIGNMENT' else 'POSITION_PATTERN_FALLBACK' end::text,
    r.policy_code::text,
    r.forced_pattern::text,
    true
  from canonical r
  left join public.ta_work_patterns wp on upper(trim(wp.pattern_code))=r.effective_pattern and coalesce(wp.is_active,true)
  left join public.shift_master s on upper(trim(s.shift_code))=r.effective_shift
  order by r.emp_code;
$$;

revoke all on function public.ta_get_employee_pattern_default_shift_v61417(text[],date) from public;
grant execute on function public.ta_get_employee_pattern_default_shift_v61417(text[],date) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Position-aware fallback for shared schedule resolvers.
--    Explicit historical assignment remains authoritative; only the fallback for
--    employees without an assignment is position-aware.
-- ---------------------------------------------------------------------------
create or replace function public.ta_resolve_employee_work_pattern_v651(
  p_emp_code text,
  p_work_date date
)
returns table (
  emp_code text,
  work_date date,
  pattern_code text,
  pattern_name text,
  work_days_per_week integer,
  scheduled_minutes_including_break integer,
  standard_work_minutes integer,
  break_minutes integer,
  weekly_off_dows integer[],
  default_template_code text,
  default_shift_code text,
  default_shift_name text,
  default_shift_start_time time,
  default_shift_end_time time
)
language sql
stable
security definer
set search_path = public
as $$
  with emp as (
    select
      public.normalize_emp_code(e."EmployeeId") as emp_code,
      coalesce(
        nullif(to_jsonb(e)->>'pc',''),
        nullif(to_jsonb(e)->>'PC',''),
        nullif(to_jsonb(e)->>'PCgrade',''),
        nullif(to_jsonb(e)->>'pcgrade','')
      ) as pc,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'PositionName','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'ตำแหน่ง','')),'')
      ) as position_name
    from public.employees e
    where public.normalize_emp_code(e."EmployeeId")
      = public.normalize_emp_code(p_emp_code)
    limit 1
  ),
  assignment as (
    select
      a.pattern_code,
      a.override_weekly_off_dows,
      a.default_template_code,
      a.default_shift_code
    from public.ta_employee_work_patterns a
    where a.emp_code = public.normalize_emp_code(p_emp_code)
      and a.effective_from <= p_work_date
      and (
        a.effective_to is null
        or a.effective_to >= p_work_date
      )
    order by a.effective_from desc,a.created_at desc
    limit 1
  ),
  resolved as (
    select
      e.emp_code,
      coalesce(
        nullif(upper(trim(coalesce(a.pattern_code,''))),''),
        case
          when coalesce(e.position_name,'') ilike '%ผู้จัดการแผนก%'
            or coalesce(e.position_name,'') ~* 'ผจก\.?[^[:alnum:]]*แผนก'
            then 'TECH_5D'
          when coalesce(e.position_name,'') ilike '%ช่างเทคนิค%'
            then 'TECH_6D'
          when regexp_replace(upper(coalesce(e.pc,'')),'[^0-9]','','g')='4'
            then 'TECH_5D'
          else 'TECH_6D'
        end
      ) as pattern_code,
      a.override_weekly_off_dows,
      a.default_template_code,
      a.default_shift_code
    from emp e
    left join assignment a on true
  )
  select
    r.emp_code,
    p_work_date,
    p.pattern_code,
    p.pattern_name,
    p.work_days_per_week,
    p.scheduled_minutes_including_break,
    p.standard_work_minutes,
    p.break_minutes,
    coalesce(r.override_weekly_off_dows,p.weekly_off_dows),
    coalesce(
      r.default_template_code,
      case
        when p.pattern_code = 'TECH_5D'
          then 'SINGLE_0830_1800'
        else 'SINGLE_0830'
      end
    ),
    canonical.default_shift_code,
    s.shift_name,
    s.start_time,
    s.end_time
  from resolved r
  join public.ta_work_patterns p
    on p.pattern_code = r.pattern_code
   and p.is_active
  left join public.ta_work_pattern_default_shifts d
    on d.pattern_code = p.pattern_code
  cross join lateral (
    select case
      when upper(trim(coalesce(r.default_shift_code,''))) in ('STD','S043','S134','S135')
        then upper(trim(r.default_shift_code))
      when upper(trim(coalesce(d.shift_code,''))) in ('D5','ST5','SINGLE_0830_1800') then 'STD'
      when upper(trim(coalesce(d.shift_code,''))) in ('D6','ST6','SINGLE_0830','SINGLE_0830_1730') then 'S043'
      when nullif(trim(coalesce(d.shift_code,'')),'') is not null then upper(trim(d.shift_code))
      when upper(trim(coalesce(r.pattern_code,'')))='TECH_5D' then 'STD'
      else 'S043'
    end as default_shift_code
  ) canonical
  left join public.shift_master s
    on upper(trim(s.shift_code)) = canonical.default_shift_code
   and s.is_active;
$$;

revoke all on function public.ta_resolve_employee_work_pattern_v651(text,date) from public;
grant execute on function public.ta_resolve_employee_work_pattern_v651(text,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Canonical lightweight schedule: employee default shift wins over the
--    pattern-wide default. Manual shift_calendar assignment still wins over Auto.
-- ---------------------------------------------------------------------------

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
        nullif(upper(trim(coalesce(p.pattern_code,''))),''),
        case
          when coalesce(e.position_name,'') ilike '%ผู้จัดการแผนก%'
            or coalesce(e.position_name,'') ~* 'ผจก\.?[^[:alnum:]]*แผนก'
            then 'TECH_5D'
          when coalesce(e.position_name,'') ilike '%ช่างเทคนิค%'
            then 'TECH_6D'
          when regexp_replace(upper(coalesce(e.pc,'')),'[^0-9]','','g')='4'
            then 'TECH_5D'
          else 'TECH_6D'
        end
      ) as resolved_pattern_code,
      p.override_weekly_off_dows,
      p.default_template_code,
      p.default_shift_code as employee_default_shift_code,
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
        -- V6.14.16: employee-level day/night preference has highest priority.
        when upper(trim(coalesce(p.employee_default_shift_code,''))) in ('STD','S043','S134','S135')
          then upper(trim(p.employee_default_shift_code))
        -- Keep legacy/global pattern defaults compatible.
        when upper(trim(coalesce(d.shift_code,''))) in ('D5','ST5','SINGLE_0830_1800') then 'STD'
        when upper(trim(coalesce(d.shift_code,''))) in ('D6','ST6','SINGLE_0830','SINGLE_0830_1730') then 'S043'
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



analyze public.ta_employee_work_patterns;
notify pgrst, 'reload schema';
commit;
