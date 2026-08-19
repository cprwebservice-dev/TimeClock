-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.12.6
-- Console / Work Plan RPC / System Period compatibility fix
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
  if to_regclass('public.ta_employee_work_patterns') is null then
    raise exception 'MISSING_TABLE: ta_employee_work_patterns';
  end if;
  if to_regclass('public.ta_daily_work_plans') is null then
    raise exception 'MISSING_TABLE: ta_daily_work_plans';
  end if;
  if to_regclass('public.ta_work_templates') is null then
    raise exception 'MISSING_TABLE: ta_work_templates';
  end if;
  if to_regclass('public.ta_system_periods') is null then
    raise exception 'MISSING_TABLE: ta_system_periods';
  end if;
  if to_regclass('public.ta_user_profiles') is null then
    raise exception 'MISSING_TABLE: ta_user_profiles';
  end if;
  if to_regprocedure('public._ta_schedule_access_days_v61025(date,date,text,text,text[])') is null then
    raise exception 'MISSING_FUNCTION: _ta_schedule_access_days_v61025';
  end if;
  if to_regprocedure('public.ta_assign_shift_single_v651(text,date,text,text,text,boolean)') is null then
    raise exception 'MISSING_FUNCTION: ta_assign_shift_single_v651';
  end if;
  if to_regprocedure('public._ta_recalculate_after_schedule_change_v61029(date,date,text[])') is null then
    raise exception 'MISSING_FUNCTION: _ta_recalculate_after_schedule_change_v61029';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Schedule Work Plan metadata V6.12.6
--    New RPC instead of overwriting legacy V6.11.8.
--    Standard template codes are ST5 / ST6.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_schedule_work_plan_meta_v6126(
  p_start_date date,
  p_end_date date,
  p_emp_codes text[] default null
)
returns table (
  work_date date,
  emp_code text,
  pattern_code text,
  employee_default_template_code text,
  daily_work_template_code text,
  effective_work_template_code text,
  template_category text,
  customer_window_start time,
  customer_window_end time,
  work_plan_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with access_days as materialized (
    select a.emp_code, a.work_date
    from public._ta_schedule_access_days_v61025(
      p_start_date,
      p_end_date,
      null,
      null,
      p_emp_codes
    ) a
  ),
  scoped_codes as materialized (
    select distinct a.emp_code from access_days a
  ),
  employee_pc as materialized (
    select
      public.normalize_emp_code(e."EmployeeId") as emp_code,
      coalesce(
        nullif(to_jsonb(e)->>'pc',''),
        nullif(to_jsonb(e)->>'PC',''),
        nullif(to_jsonb(e)->>'PCgrade',''),
        nullif(to_jsonb(e)->>'pcgrade',''),
        ''
      ) as pc
    from public.employees e
    join scoped_codes s
      on s.emp_code = public.normalize_emp_code(e."EmployeeId")
  ),
  ranked as materialized (
    select
      a.emp_code,
      a.work_date,
      coalesce(
        p.pattern_code,
        case
          when regexp_replace(upper(coalesce(e.pc,'')),'[^0-9]','','g') = '4'
            then 'TECH_5D'
          else 'TECH_6D'
        end
      ) as pattern_code,
      p.default_template_code,
      row_number() over (
        partition by a.emp_code,a.work_date
        order by p.effective_from desc nulls last,p.created_at desc nulls last
      ) as rn
    from access_days a
    left join employee_pc e on e.emp_code=a.emp_code
    left join public.ta_employee_work_patterns p
      on p.emp_code=a.emp_code
     and p.effective_from <= a.work_date
     and (p.effective_to is null or p.effective_to >= a.work_date)
  ),
  base as materialized (
    select
      r.work_date,
      r.emp_code,
      upper(trim(coalesce(r.pattern_code,'TECH_6D'))) as pattern_code,
      case
        when upper(trim(coalesce(r.default_template_code,''))) in ('EARLY_SPLIT_FLEX','SPLIT_FLEX')
          then 'SPLIT_FLEX'
        when upper(trim(coalesce(r.default_template_code,''))) in ('SINGLE_0830','SINGLE_0830_1730','ST6')
          then 'ST6'
        when upper(trim(coalesce(r.default_template_code,''))) in ('SINGLE_0830_1800','ST5')
          then 'ST5'
        when nullif(trim(coalesce(r.default_template_code,'')),'') is not null
          then upper(trim(r.default_template_code))
        when upper(trim(coalesce(r.pattern_code,'')))='TECH_5D'
          then 'ST5'
        else 'ST6'
      end as employee_default_template_code
    from ranked r
    where r.rn=1
  ),
  plans as materialized (
    select
      d.emp_code,
      d.work_date,
      case
        when upper(trim(coalesce(d.template_code,''))) in ('EARLY_SPLIT_FLEX','SPLIT_FLEX')
          then 'SPLIT_FLEX'
        when upper(trim(coalesce(d.template_code,''))) in ('SINGLE_0830','SINGLE_0830_1730','ST6')
          then 'ST6'
        when upper(trim(coalesce(d.template_code,''))) in ('SINGLE_0830_1800','ST5')
          then 'ST5'
        else upper(trim(coalesce(d.template_code,'')))
      end as daily_work_template_code,
      d.customer_window_start,
      d.customer_window_end,
      d.status
    from public.ta_daily_work_plans d
    join access_days a
      on a.emp_code=d.emp_code and a.work_date=d.work_date
    where coalesce(d.status,'') <> 'CANCELLED'
  )
  select
    b.work_date,
    b.emp_code,
    b.pattern_code,
    b.employee_default_template_code,
    p.daily_work_template_code,
    coalesce(nullif(p.daily_work_template_code,''),b.employee_default_template_code)
      as effective_work_template_code,
    case
      when coalesce(nullif(p.daily_work_template_code,''),b.employee_default_template_code)='SPLIT_FLEX'
        then 'NORMAL_LATE_CUSTOMER'
      else 'NORMAL'
    end as template_category,
    p.customer_window_start,
    p.customer_window_end,
    p.status as work_plan_status
  from base b
  left join plans p
    on p.emp_code=b.emp_code and p.work_date=b.work_date
  order by b.emp_code,b.work_date;
$$;

revoke all on function public.ta_get_schedule_work_plan_meta_v6126(date,date,text[]) from public;
grant execute on function public.ta_get_schedule_work_plan_meta_v6126(date,date,text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Effective Daily Work Plan V6.12.6
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_effective_daily_work_plan_v6126(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_result jsonb;
begin
  if not public.ta_can_access_employee_v680(v_emp,p_work_date,'VIEW') then
    raise exception 'SCHEDULE_VIEW_PERMISSION_DENIED';
  end if;

  select to_jsonb(m)
  into v_result
  from public.ta_get_schedule_work_plan_meta_v6126(
    p_work_date,p_work_date,array[v_emp]::text[]
  ) m
  where m.emp_code=v_emp and m.work_date=p_work_date
  limit 1;

  if v_result is null then
    raise exception 'WORK_PATTERN_NOT_FOUND';
  end if;

  return v_result;
end;
$$;

revoke all on function public.ta_get_effective_daily_work_plan_v6126(text,date) from public;
grant execute on function public.ta_get_effective_daily_work_plan_v6126(text,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Atomic Schedule + Daily Work Plan Save V6.12.6
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_shift_with_work_plan_v6126(
  p_emp_code text,
  p_work_date date,
  p_shift_code text,
  p_template_code text,
  p_customer_window_start time default null,
  p_customer_window_end time default null,
  p_customer_end_mode text default 'ACTUAL_OUT',
  p_note text default null,
  p_change_reason text default null,
  p_confirm_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_template text := upper(trim(coalesce(p_template_code,'')));
  v_pattern text;
  v_employee_default text;
  v_normal_template text;
  v_end_mode text := upper(trim(coalesce(
    p_customer_end_mode,
    case when p_customer_window_end is null then 'ACTUAL_OUT' else 'FIXED' end
  )));
  v_customer_start time := p_customer_window_start;
  v_customer_end time := p_customer_window_end;
  v_shift_result jsonb;
  v_plan jsonb;
  v_recalc jsonb;
  v_auto_confirm boolean := nullif(trim(coalesce(p_shift_code,'')),'') is not null;
begin
  select m.pattern_code,m.employee_default_template_code
  into v_pattern,v_employee_default
  from public.ta_get_schedule_work_plan_meta_v6126(
    p_work_date,p_work_date,array[v_emp]::text[]
  ) m
  where m.emp_code=v_emp and m.work_date=p_work_date
  limit 1;

  if nullif(trim(coalesce(v_pattern,'')),'') is null then
    raise exception 'WORK_PATTERN_NOT_FOUND';
  end if;

  v_pattern := upper(trim(v_pattern));
  v_normal_template := case v_pattern
    when 'TECH_5D' then 'ST5'
    when 'TECH_6D' then 'ST6'
    else upper(trim(coalesce(v_employee_default,'')))
  end;

  if v_template in ('SINGLE_0830','SINGLE_0830_1730') then
    v_template := 'ST6';
  elsif v_template='SINGLE_0830_1800' then
    v_template := 'ST5';
  elsif v_template='EARLY_SPLIT_FLEX' then
    v_template := 'SPLIT_FLEX';
  end if;

  if nullif(v_template,'') is null then
    v_template := v_normal_template;
  end if;

  if v_template not in (v_normal_template,'SPLIT_FLEX') then
    raise exception
      'WORK_TEMPLATE_NOT_ALLOWED_FOR_PATTERN: pattern=% normal=% requested=%',
      v_pattern,v_normal_template,v_template;
  end if;

  if not exists (
    select 1 from public.ta_work_templates t
    where upper(trim(t.template_code))=v_template
      and coalesce(t.is_active,true)
  ) then
    raise exception 'WORK_TEMPLATE_NOT_FOUND: %',v_template;
  end if;

  if v_template='SPLIT_FLEX' then
    if v_customer_start is null then
      raise exception 'CUSTOMER_WINDOW_START_REQUIRED_FOR_SPLIT_FLEX';
    end if;
    if v_end_mode not in ('ACTUAL_OUT','FIXED') then
      raise exception 'INVALID_CUSTOMER_END_MODE';
    end if;
    if v_end_mode='FIXED' then
      if v_customer_end is null then
        raise exception 'CUSTOMER_WINDOW_END_REQUIRED_FOR_FIXED_MODE';
      end if;
      if v_customer_start=v_customer_end then
        raise exception 'CUSTOMER_WINDOW_START_END_MUST_DIFFER';
      end if;
    else
      v_customer_end := null;
    end if;
  else
    v_end_mode := 'NONE';
    v_customer_start := null;
    v_customer_end := null;
  end if;

  v_shift_result := public.ta_assign_shift_single_v651(
    v_emp,p_work_date,p_shift_code,p_note,p_change_reason,v_auto_confirm
  );

  insert into public.ta_daily_work_plans (
    emp_code,work_date,template_code,
    customer_window_start,customer_window_end,
    status,day_override_type,custom_segments,note,calculation_note,
    created_by,updated_by
  ) values (
    v_emp,p_work_date,v_template,
    v_customer_start,v_customer_end,
    case when v_auto_confirm then 'CONFIRMED' else 'PLANNED' end,
    null,null,nullif(trim(coalesce(p_note,'')),''),
    case
      when v_template='SPLIT_FLEX' and v_end_mode='ACTUAL_OUT'
        then 'V6.12.6 SPLIT_FLEX ACTUAL_OUT'
      when v_template='SPLIT_FLEX'
        then 'V6.12.6 SPLIT_FLEX FIXED'
      else 'V6.12.6 NORMAL'
    end,
    auth.uid(),auth.uid()
  )
  on conflict(emp_code,work_date)
  do update set
    template_code=excluded.template_code,
    customer_window_start=excluded.customer_window_start,
    customer_window_end=excluded.customer_window_end,
    status=excluded.status,
    day_override_type=null,
    custom_segments=null,
    note=excluded.note,
    calculation_note=excluded.calculation_note,
    updated_by=auth.uid(),
    updated_at=now();

  select to_jsonb(d)
  into v_plan
  from public.ta_daily_work_plans d
  where d.emp_code=v_emp and d.work_date=p_work_date
  limit 1;

  v_recalc := public._ta_recalculate_after_schedule_change_v61029(
    p_work_date,p_work_date,array[v_emp]::text[]
  );

  return coalesce(v_shift_result,'{}'::jsonb)
    || jsonb_build_object(
      'work_plan',v_plan,
      'pattern_code',v_pattern,
      'employee_default_template_code',v_normal_template,
      'effective_work_template_code',v_template,
      'daily_template_override',(v_template<>v_normal_template),
      'customer_window_start',v_customer_start,
      'customer_window_end',v_customer_end,
      'customer_end_mode',v_end_mode,
      'template_locked',false,
      'auto_confirm_on_save',v_auto_confirm,
      'attendance_recalculation',v_recalc,
      'version','V6.12.6'
    );
end;
$$;

revoke all on function public.ta_assign_shift_with_work_plan_v6126(
  text,date,text,text,time,time,text,text,text,boolean
) from public;
grant execute on function public.ta_assign_shift_with_work_plan_v6126(
  text,date,text,text,time,time,text,text,text,boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) System Period date status V6.12.6
--    Self-contained role lookup to avoid the legacy dependency chain that was
--    producing repeated HTTP 400 responses on the Calendar page.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_system_period_for_date_v6126(
  p_work_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_active boolean;
  v_month date := date_trunc('month',p_work_date)::date;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_period public.ta_system_periods%rowtype;
  v_configured boolean := false;
  v_schedule_allowed boolean := false;
  v_certify_allowed boolean := false;
  v_state jsonb;
begin
  select
    case
      when upper(trim(coalesce(p.role,'')))='USER' then 'MANAGER'
      when upper(trim(coalesce(p.role,''))) in ('HR_ADMIN','MANAGER','VIEWER')
        then upper(trim(p.role))
      else 'VIEWER'
    end,
    coalesce(p.is_active,false)
  into v_role,v_active
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
  limit 1;

  if v_role is null or not coalesce(v_active,false) then
    raise exception 'USER_PROFILE_NOT_ACTIVE';
  end if;

  select * into v_period
  from public.ta_system_periods p
  where p.period_month=v_month
  limit 1;

  v_configured := found;

  if not v_configured then
    v_state := jsonb_build_object(
      'configured',false,
      'period_month',v_month,
      'schedule_status','NOT_CONFIGURED',
      'certification_status','NOT_CONFIGURED'
    );
  else
    v_state := jsonb_build_object(
      'configured',true,
      'period_id',v_period.period_id,
      'period_month',v_period.period_month,
      'period_start',v_period.period_month,
      'period_end',(v_period.period_month+interval '1 month'-interval '1 day')::date,
      'today',v_today,
      'schedule_edit_deadline',v_period.schedule_edit_deadline,
      'attendance_certify_deadline',v_period.attendance_certify_deadline,
      'schedule_open',v_period.schedule_open,
      'certification_open',v_period.certification_open,
      'schedule_deadline_passed',v_today>v_period.schedule_edit_deadline,
      'certification_deadline_passed',v_today>v_period.attendance_certify_deadline,
      'schedule_status',case
        when not v_period.schedule_open then 'CLOSED_MANUAL'
        when v_today>v_period.schedule_edit_deadline then 'CLOSED_DEADLINE'
        when (v_period.schedule_edit_deadline-v_today) between 0 and 3 then 'DUE_SOON'
        else 'OPEN'
      end,
      'certification_status',case
        when not v_period.certification_open then 'CLOSED_MANUAL'
        when v_today>v_period.attendance_certify_deadline then 'CLOSED_DEADLINE'
        when (v_period.attendance_certify_deadline-v_today) between 0 and 3 then 'DUE_SOON'
        else 'OPEN'
      end,
      'note',v_period.note,
      'updated_by_email',v_period.updated_by_email,
      'updated_at',v_period.updated_at
    );
  end if;

  if v_role='HR_ADMIN' then
    v_schedule_allowed := true;
    v_certify_allowed := true;
  elsif v_role='MANAGER' then
    if not v_configured then
      v_schedule_allowed := true;
      v_certify_allowed := true;
    else
      v_schedule_allowed := coalesce(v_period.schedule_open,false)
        and not (v_today>v_period.schedule_edit_deadline);
      v_certify_allowed := coalesce(v_period.certification_open,false)
        and not (v_today>v_period.attendance_certify_deadline);
    end if;
  end if;

  return v_state || jsonb_build_object(
    'role',v_role,
    'can_schedule_edit',v_schedule_allowed,
    'can_certify_attendance',v_certify_allowed,
    'hr_admin_override',(v_role='HR_ADMIN'),
    'version','V6.12.6'
  );
end;
$$;

revoke all on function public.ta_get_system_period_for_date_v6126(date) from public;
grant execute on function public.ta_get_system_period_for_date_v6126(date) to authenticated;

notify pgrst,'reload schema';
commit;
